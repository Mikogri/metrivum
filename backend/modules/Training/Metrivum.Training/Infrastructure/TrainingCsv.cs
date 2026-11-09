using System.Globalization;
using System.Text;
using System.Text.Json;
using CsvHelper;
using CsvHelper.Configuration;
using Metrivum.Training.Domain;

namespace Metrivum.Training.Infrastructure;

/// <summary>Parses and exports the supported training CSV format without directly writing application tables.</summary>
public static class TrainingCsv
{
    public static readonly string[] Columns = ["format_version", "row_kind", "program_name", "program_description", "block_id", "block_name", "block_description", "cycle_id", "cycle_name", "cycle_description", "cycle_days", "day_id", "day_number", "workout_id", "workout_name", "workout_description", "instance_id", "exercise_name", "comment", "sets_json", "groups_json", "exercise_snapshot_json", "formula_snapshots_json"];
    private static CsvConfiguration Config(string delimiter)
    {
        if (delimiter is not ("," or ";" or "\t"))
            throw new TrainingValidationException("Delimiter must be comma, semicolon, or tab.");
        return new(CultureInfo.InvariantCulture)
        {
            Delimiter = delimiter,
            HasHeaderRecord = true,
            NewLine = "\r\n",
            MaxFieldSize = 1_048_576,
            ExceptionMessagesContainRawData = false
        };
    }
    public static CsvRow[] Parse(string content, string delimiter, int maximumRows)
    {
        try
        {
            using var text = new StringReader(content.TrimStart('\uFEFF'));
            using var reader = new CsvReader(text, Config(delimiter));
            if (!reader.Read())
                throw new TrainingValidationException("CSV is empty.");
            reader.ReadHeader();
            if (reader.HeaderRecord is null || !reader.HeaderRecord.SequenceEqual(Columns))
                throw new TrainingValidationException("Expected Metrivum CSV v1 columns in the documented order.");
            var rows = new List<CsvRow>();
            while (reader.Read())
            {
                if (rows.Count >= maximumRows)
                    throw new TrainingValidationException("CSV row limit exceeded.");
                if (reader.Parser.Count != Columns.Length)
                    throw new TrainingValidationException("CSV record has an incorrect number of fields.");
                string Raw(string key) => reader.GetField(key) ?? "";
                string Text(string key) => DecodeText(Raw(key));
                Guid Id(string key) => string.IsNullOrEmpty(Raw(key)) ? Guid.Empty : Guid.ParseExact(Raw(key), "D");
                int Number(string key) => int.Parse(Raw(key), NumberStyles.None, CultureInfo.InvariantCulture);
                var version = Number("format_version");
                if (version != 1)
                    throw new TrainingValidationException("Unsupported CSV version.");
                var kind = Raw("row_kind");
                if (kind is not ("program" or "block" or "cycle" or "day" or "workout" or "exercise"))
                    throw new TrainingValidationException("Invalid CSV row kind.");
                rows.Add(new(version, Text("program_name"), Text("program_description"), Id("block_id"), Text("block_name"), Text("block_description"), Id("cycle_id"), Text("cycle_name"), Text("cycle_description"), Number("cycle_days"), Id("day_id"), Number("day_number"), Id("workout_id"), Text("workout_name"), Text("workout_description"), Id("instance_id"), Text("exercise_name"), Text("comment"), TrainingJson.Deserialize<TrainingSet[]>(Raw("sets_json")), TrainingJson.Deserialize<ExerciseGroup[]>(Raw("groups_json")), kind,
                    string.IsNullOrWhiteSpace(Raw("exercise_snapshot_json")) ? null : TrainingJson.Deserialize<Metrivum.ExerciseCatalog.Contracts.ExerciseSnapshot>(Raw("exercise_snapshot_json")), string.IsNullOrWhiteSpace(Raw("formula_snapshots_json")) ? null : TrainingJson.Deserialize<Dictionary<Guid, FormulaEvaluation>>(Raw("formula_snapshots_json"))));
            }
            if (rows.Count == 0)
                throw new TrainingValidationException("CSV has no data rows.");
            return rows.ToArray();
        }
        catch (Exception e) when (e is CsvHelperException or FormatException or OverflowException or JsonException or ArgumentException) { throw new TrainingValidationException("Malformed CSV record, JSON, or invariant number."); }
    }
    public static string Export(RevisionSnapshot snapshot, string delimiter)
    {
        using var text = new StringWriter(CultureInfo.InvariantCulture);
        using var writer = new CsvWriter(text, Config(delimiter));
        foreach (var column in Columns)
            writer.WriteField(column);
        writer.NextRecord();
        foreach (var row in Rows(snapshot))
        {
            string GuidField(Guid value) => value == Guid.Empty ? "" : value.ToString("D");
            foreach (var value in new object[] { 1, row.RowKind, EncodeText(row.ProgramName), EncodeText(row.ProgramDescription), GuidField(row.BlockId), EncodeText(row.BlockName), EncodeText(row.BlockDescription), GuidField(row.CycleId), EncodeText(row.CycleName), EncodeText(row.CycleDescription), row.CycleDays, GuidField(row.DayId), row.DayNumber, GuidField(row.WorkoutId), EncodeText(row.WorkoutName), EncodeText(row.WorkoutDescription), GuidField(row.InstanceId), EncodeText(row.ExerciseName), EncodeText(row.Comment), TrainingJson.Serialize(row.Sets), TrainingJson.Serialize(row.Groups), row.Exercise == null ? "" : TrainingJson.Serialize(row.Exercise), row.FormulaSnapshots == null ? "" : TrainingJson.Serialize(row.FormulaSnapshots) })
                writer.WriteField(value);
            writer.NextRecord();
        }
        return "\uFEFF" + text;
    }
    public static CsvRow[] Rows(RevisionSnapshot snapshot)
    {
        var rows = new List<CsvRow>();
        var root = new CsvRow(1, snapshot.Name, snapshot.Description, Guid.Empty, "", "", Guid.Empty, "", "", 0, Guid.Empty, 0, Guid.Empty, "", "", Guid.Empty, "", "", [], [], "program");
        if (snapshot.Document.Blocks.Length == 0)
            rows.Add(root);
        foreach (var block in snapshot.Document.Blocks)
        {
            var br = root with
            {
                BlockId = block.Id,
                BlockName = block.Name,
                BlockDescription = block.Description,
                RowKind = "block"
            };
            if (block.Cycles.Length == 0)
                rows.Add(br);
            foreach (var cycle in block.Cycles)
            {
                var cr = br with
                {
                    CycleId = cycle.Id,
                    CycleName = cycle.Name,
                    CycleDescription = cycle.Description,
                    CycleDays = cycle.DayCount,
                    RowKind = "cycle"
                };
                if (cycle.Days.Length == 0)
                    rows.Add(cr);
                foreach (var day in cycle.Days)
                {
                    var dr = cr with
                    {
                        DayId = day.Id,
                        DayNumber = day.DayNumber,
                        RowKind = "day"
                    };
                    if (day.Workouts.Length == 0)
                        rows.Add(dr);
                    foreach (var workout in day.Workouts)
                    {
                        var wr = dr with
                        {
                            WorkoutId = workout.Id,
                            WorkoutName = workout.Name,
                            WorkoutDescription = workout.Description,
                            Groups = workout.Groups,
                            RowKind = "workout"
                        };
                        if (workout.Exercises.Length == 0)
                            rows.Add(wr);
                        foreach (var exercise in workout.Exercises)
                        {
                            if (!snapshot.Exercises.TryGetValue(exercise.ExerciseId, out var details))
                                throw new TrainingValidationException("Revision exercise snapshot is missing.");
                            var ids = exercise.Sets.SelectMany(s => new[] { s.Id }.Concat((s.Segments ?? []).Select(p => p.Id))).ToHashSet();
                            rows.Add(wr with
                            {
                                InstanceId = exercise.Id,
                                ExerciseName = details.Name,
                                Comment = exercise.Comment,
                                Sets = exercise.Sets,
                                RowKind = "exercise",
                                Exercise = details,
                                FormulaSnapshots = snapshot.Formulas.Where(x => ids.Contains(x.Key)).ToDictionary()
                            });
                        }
                    }
                }
            }
        }
        return rows.ToArray();
    }
    public static TrainingDocument Build(CsvRow[] rows, IReadOnlyDictionary<int, Guid> mapping)
    {
        if (rows is null || rows.Length == 0)
            throw new TrainingValidationException("CSV has no data rows.");
        Consistent(rows.Select(r => (r.ProgramName, r.ProgramDescription)), "program");
        var indexed = rows.Select((row, index) => (Row: row, Index: index)).ToArray();
        foreach (var item in indexed)
        {
            if (item.Row.RowKind == "exercise" && (!mapping.TryGetValue(item.Index, out var exercise) || exercise == Guid.Empty))
                throw new TrainingValidationException($"Exercise in row {item.Index + 1} requires explicit catalog mapping.");
            var level = Array.IndexOf(new[] { "program", "block", "cycle", "day", "workout", "exercise" }, item.Row.RowKind);
            var ids = new[] { item.Row.BlockId, item.Row.CycleId, item.Row.DayId, item.Row.WorkoutId, item.Row.InstanceId };
            if (ids.Where((id, i) => i < level ? id == Guid.Empty : id != Guid.Empty).Any())
                throw new TrainingValidationException("CSV row hierarchy does not match its row kind.");
        }
        if (mapping.Keys.Any(k => k < 0 || k >= rows.Length || rows[k].RowKind != "exercise"))
            throw new TrainingValidationException("Mapping contains an invalid row index.");
        var blocks = new List<Block>();
        foreach (var blockRows in indexed.Where(x => x.Row.BlockId != Guid.Empty).GroupBy(x => x.Row.BlockId))
        {
            var b = blockRows.First().Row;
            Consistent(blockRows.Select(x => (x.Row.BlockName, x.Row.BlockDescription)), "block");
            var cycles = new List<Cycle>();
            foreach (var cycleRows in blockRows.Where(x => x.Row.CycleId != Guid.Empty).GroupBy(x => x.Row.CycleId))
            {
                var c = cycleRows.First().Row;
                Consistent(cycleRows.Select(x => (x.Row.CycleName, x.Row.CycleDescription, x.Row.CycleDays)), "cycle");
                var days = new List<TrainingDay>();
                foreach (var dayRows in cycleRows.Where(x => x.Row.DayId != Guid.Empty).GroupBy(x => x.Row.DayId))
                {
                    var d = dayRows.First().Row;
                    Consistent(dayRows.Select(x => x.Row.DayNumber), "day");
                    var workouts = new List<Workout>();
                    foreach (var workoutRows in dayRows.Where(x => x.Row.WorkoutId != Guid.Empty).GroupBy(x => x.Row.WorkoutId))
                    {
                        var w = workoutRows.First().Row;
                        Consistent(workoutRows.Select(x => (x.Row.WorkoutName, x.Row.WorkoutDescription, Groups: TrainingJson.Serialize(x.Row.Groups))), "workout");
                        var exercises = workoutRows.Where(x => x.Row.RowKind == "exercise").Select(x => new ExerciseInstance(x.Row.InstanceId, mapping[x.Index], x.Row.Comment, x.Row.Sets)).ToArray();
                        workouts.Add(new(w.WorkoutId, w.WorkoutName, w.WorkoutDescription, exercises, w.Groups));
                    }
                    days.Add(new(d.DayId, d.DayNumber, workouts.ToArray()));
                }
                // A nameless cycle or block only holds what is not in one (see Cycle.Implicit and Block.Implicit).
                cycles.Add(new(c.CycleId, c.CycleName, c.CycleDescription, c.CycleDays, days.ToArray(), Implicit: string.IsNullOrWhiteSpace(c.CycleName) ? true : null));
            }
            blocks.Add(new(b.BlockId, b.BlockName, b.BlockDescription, cycles.ToArray(), Implicit: string.IsNullOrWhiteSpace(b.BlockName) ? true : null));
        }
        return new(1, blocks.ToArray());
    }
    private static void Consistent<T>(IEnumerable<T> values, string scope)
    {
        if (values.Distinct().Skip(1).Any())
            throw new TrainingValidationException($"Conflicting {scope} metadata in CSV.");
    }
    private static string EncodeText(string value) => value.Length > 0 && (value[0] == '\'' || value[0] is '=' or '+' or '-' or '@' or '\t' or '\r' or '\n' || char.IsWhiteSpace(value[0])) ? "'" + value : value;
    private static string DecodeText(string value) => value.StartsWith('\'') ? value[1..] : value;
}
