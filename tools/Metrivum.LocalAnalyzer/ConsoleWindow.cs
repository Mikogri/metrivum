using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Text;

/// <summary>
/// The analyzer's own window. It may have been started without one (by another program or hidden); "Show analyzer
/// window" in Metrivum, or starting the analyzer a second time, then opens a console and replays the recent log.
/// </summary>
internal static class ConsoleWindow
{
    private const int Kept = 400;
    private static readonly ConcurrentQueue<string> Recent = new();
    private static readonly object Sync = new();
    private static Tee? output;
    private static Tee? error;

    /// <summary>Keeps the last lines written to the console so a window opened later can show them.</summary>
    public static void Capture()
    {
        output = new Tee(Console.Out);
        error = new Tee(Console.Error);
        Console.SetOut(output);
        Console.SetError(error);
    }

    public static void Show(string title)
    {
        lock (Sync)
        {
            var window = GetConsoleWindow();
            // Started without a visible window: leave the hidden console and open a real one.
            if (window == IntPtr.Zero && (FreeConsole() || true) && AllocConsole())
            {
                // A new console: point Console at it and print what happened so far.
                var console = new StreamWriter(
                    new FileStream("CONOUT$", FileMode.Open, FileAccess.Write),
                    new UTF8Encoding(false)
                )
                {
                    AutoFlush = true,
                };
                Console.OutputEncoding = Encoding.UTF8;
                Console.Title = title;
                console.WriteLine("— recent analyzer log —");
                foreach (var line in Recent)
                    console.WriteLine(line);
                output?.Replace(console);
                error?.Replace(console);
                window = GetConsoleWindow();
            }
            if (window == IntPtr.Zero)
                return;
            ShowWindow(
                window,
                9 /* SW_RESTORE */
            );
            SetForegroundWindow(window);
        }
    }

    /// <summary>Lets the already running analyzer bring its window to the front (Windows only allows the foreground app to grant that).</summary>
    public static void AllowAnyForeground() => AllowSetForegroundWindow(-1);

    private sealed class Tee(TextWriter inner) : TextWriter
    {
        private TextWriter inner = inner;
        private readonly StringBuilder line = new();
        public override Encoding Encoding => inner.Encoding;

        public void Replace(TextWriter next)
        {
            lock (line)
                inner = next;
        }

        public override void Write(char value)
        {
            lock (line)
            {
                try
                {
                    inner.Write(value);
                }
                catch (IOException) { }
                catch (ObjectDisposedException) { }
                if (value == '\n')
                {
                    Recent.Enqueue(line.ToString().TrimEnd('\r'));
                    while (Recent.Count > Kept)
                        Recent.TryDequeue(out _);
                    line.Clear();
                }
                else
                    line.Append(value);
            }
        }

        public override void Write(string? value)
        {
            if (value is null)
                return;
            foreach (var c in value)
                Write(c);
        }

        public override void WriteLine(string? value)
        {
            Write(value);
            Write('\n');
        }

        public override void Flush()
        {
            lock (line)
            {
                try
                {
                    inner.Flush();
                }
                catch (IOException) { }
                catch (ObjectDisposedException) { }
            }
        }
    }

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetConsoleWindow();

    [DllImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AllocConsole();

    [DllImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool FreeConsole();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ShowWindow(IntPtr window, int command);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AllowSetForegroundWindow(int process);
}
