using System.Text.Json;
using Metrivum.MotionTraceBridge;

public static class WorkerChecks
{
    public static async Task Run(string root, string python)
    {
        var script = Path.Combine(root, "worker-fixture.py");
        await File.WriteAllTextAsync(script, """
            import sys,json,os,time
            for line in sys.stdin:
                request=json.loads(line)
                print(json.dumps({'stage':'fixture','pid':os.getpid()}),flush=True)
                if '--hang' in request['arguments']:time.sleep(30)
                if '--crash' in request['arguments']:sys.exit(2)
                if '--stderr' in request['arguments']:
                    for i in range(2000):print('diagnostic '+str(i),file=sys.stderr)
                print(json.dumps({'workerRequest':request['request'],'ok':'--fail' not in request['arguments']}),flush=True)
            """);
        await using var worker = new PythonAnalysisSession(TimeSpan.FromMilliseconds(150));
        async Task<int> Call(string[] arguments, CancellationToken token = default)
        {
            var pid = 0;
            await worker.RunAsync(python, script, arguments, root, token, line => {
                using var value = JsonDocument.Parse(line);
                if (value.RootElement.TryGetProperty("pid", out var id)) pid = id.GetInt32();
            });
            return pid;
        }
        var first = await Call([]);
        var second = await Call(["--stderr"]);
        if (first == 0 || first != second) throw new Exception("Successful jobs must reuse their worker and drain diagnostics");
        using (var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
        {
            while (true)
            {
                try { using var process = System.Diagnostics.Process.GetProcessById(second); if (process.HasExited) break; }
                catch (ArgumentException) { break; }
                await Task.Delay(20, deadline.Token);
            }
        }
        var afterIdle = await Call([]);
        if (afterIdle == second) throw new Exception("Idle workers must release their process");
        try { await Call(["--fail"]); throw new Exception("Failed receipt accepted"); }
        catch (InvalidOperationException) { }
        var afterFailure = await Call([]);
        if (afterFailure == afterIdle) throw new Exception("Failed workers must not survive into another job");
        using (var cancel = new CancellationTokenSource(TimeSpan.FromMilliseconds(200)))
        {
            try { await Call(["--hang"], cancel.Token); throw new Exception("Cancellation did not stop the worker"); }
            catch (OperationCanceledException) { }
        }
        var afterCancel = await Call([]);
        if (afterCancel == afterFailure) throw new Exception("Cancellation must recycle the process");
        try { await Call(["--crash"]); throw new Exception("Native worker exit accepted"); }
        catch (InvalidOperationException) { }
        if (await Call([]) == afterCancel) throw new Exception("A crashed worker must restart");
        Console.WriteLine("PASS: worker reuse, stderr draining, idle release, failed receipts, cancellation and crashes.");
    }
}
