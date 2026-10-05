using System.Globalization;
using System.Reflection;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf;
using TrainFlow.Training.Domain;

namespace TrainFlow.Training.Infrastructure;

public static class TrainingPdf
{
    private static readonly object FontLock = new();
    private static bool fontsReady;
    public static byte[] Render(RevisionSnapshot snapshot)
    {
        lock (FontLock)
        {
            if (!fontsReady)
            {
                GlobalFontSettings.FontResolver ??= new EmbeddedFontResolver();
                fontsReady = true;
            }
        }
        using var document = new PdfDocument();
        document.Info.Title = snapshot.Name;
        document.Info.Author = "TrainFlow";
        var font = new XFont("TrainFlow Noto Sans", 9, XFontStyleEx.Regular, new XPdfFontOptions(PdfFontEncoding.Unicode));
        var heading = new XFont("TrainFlow Noto Sans", 14, XFontStyleEx.Regular, new XPdfFontOptions(PdfFontEncoding.Unicode));
        XGraphics? graphics = null;
        double y = 0;
        var pageNumber = 0;
        void Page()
        {
            graphics?.Dispose();
            var page = document.AddPage();
            page.Size = PdfSharp.PageSize.A4;
            graphics = XGraphics.FromPdfPage(page);
            y = 44;
            pageNumber++;
            graphics.DrawString($"TrainFlow · {pageNumber}", font, XBrushes.Gray, new XRect(40, page.Height.Point - 30, page.Width.Point - 80, 15), XStringFormats.TopLeft);
        }
        void Lines(string text, bool title = false)
        {
            var selected = title ? heading : font;
            var height = title ? 21 : 14;
            foreach (var line in PdfTextLayout.Wrap(text ?? "", 510, value => graphics!.MeasureString(value, selected).Width))
            {
                Print(line);
            }
            void Print(string line)
            {
                if (y + height > 790)
                    Page();
                graphics!.DrawString(line, selected, XBrushes.Black, new XRect(40, y, 515, height), XStringFormats.TopLeft);
                y += height;
            }
        }
        void Table(string left, string right)
        {
            var leftLines = PdfTextLayout.Wrap(left, 117, value => graphics!.MeasureString(value, font).Width);
            var rightLines = PdfTextLayout.Wrap(right, 382, value => graphics!.MeasureString(value, font).Width);
            var count = Math.Max(leftLines.Length, rightLines.Length);
            for (var offset = 0; offset < count;)
            {
                if (y + 28 > 790)
                    Page();
                var available = Math.Max(1, (int)((785 - y) / 14) - 1);
                var chunk = Math.Min(available, count - offset);
                var height = chunk * 14 + 8;
                graphics!.DrawRectangle(XPens.LightGray, 40, y, 125, height);
                graphics.DrawRectangle(XPens.LightGray, 165, y, 390, height);
                for (var i = 0; i < chunk; i++)
                {
                    if (offset + i < leftLines.Length)
                        graphics.DrawString(leftLines[offset + i], font, XBrushes.Black, new XRect(44, y + 4 + i * 14, 117, 14), XStringFormats.TopLeft);
                    if (offset + i < rightLines.Length)
                        graphics.DrawString(rightLines[offset + i], font, XBrushes.Black, new XRect(169, y + 4 + i * 14, 382, 14), XStringFormats.TopLeft);
                }
                y += height;
                offset += chunk;
            }
        }
        Page();
        Lines(snapshot.Name, true);
        Lines(snapshot.Description);
        Lines($"{snapshot.Kind} · private revision · schema {snapshot.SchemaVersion}");
        foreach (var block in snapshot.Document.Blocks)
        {
            y += 10;
            Lines(block.Name, true);
            Lines(block.Description);
            foreach (var cycle in block.Cycles)
            {
                Lines($"{cycle.Name} · {cycle.DayCount} days", true);
                Lines(cycle.Description);
                foreach (var day in cycle.Days)
                    foreach (var workout in day.Workouts)
                    {
                        Lines($"Day {day.DayNumber} · {workout.Name}", true);
                        Lines(workout.Description);
                        foreach (var group in workout.Groups)
                            Lines($"{group.Kind}: {group.Rounds} rounds; rest {group.RestSeconds.ToString(CultureInfo.InvariantCulture)} s; exercises {string.Join(", ", group.ExerciseIds.Select(id => workout.Exercises.First(e => e.Id == id)).Select(e => snapshot.Exercises[e.ExerciseId].Name))}");
                        foreach (var exercise in workout.Exercises)
                        {
                            var details = snapshot.Exercises[exercise.ExerciseId];
                            Lines(details.Name, true);
                            Lines(details.Description);
                            Lines(details.Instructions);
                            Lines(exercise.Comment);
                            for (var i = 0; i < exercise.Sets.Length; i++)
                            {
                                var set = exercise.Sets[i];
                                Table($"{i + 1}. {set.Kind}", Describe(set.Prescription, snapshot.Formulas.GetValueOrDefault(set.Id)) + (set.SourceSetId is { } source ? $" | top set {Array.FindIndex(exercise.Sets, s => s.Id == source) + 1}" : ""));
                                foreach (var segment in set.Segments ?? [])
                                    Table("  Segment", Describe(segment.Prescription, snapshot.Formulas.GetValueOrDefault(segment.Id)));
                            }
                            y += 6;
                        }
                    }
            }
        }
        graphics?.Dispose();
        using var stream = new MemoryStream();
        document.Save(stream, false);
        return stream.ToArray();
    }
    private static string Describe(Prescription p, FormulaEvaluation? formula)
    {
        var parts = new List<string>();
        string Q(Quantity q) => q.Value.ToString(CultureInfo.InvariantCulture) + " " + q.Unit;
        if (p.Reps is { } reps)
            parts.Add(reps.Minimum == reps.Maximum ? $"{reps.Minimum} reps" : $"{reps.Minimum}–{reps.Maximum} reps");
        if (p.Load is { } load)
            parts.Add(load.Minimum == load.Maximum ? Q(load.Minimum) : $"{Q(load.Minimum)}–{Q(load.Maximum)}");
        if (p.LoadPercent is { } percent)
            parts.Add($"{percent.ToString(CultureInfo.InvariantCulture)}% of {Q(p.BaseValue!)}");
        if (p.Rpe is { } rpe)
            parts.Add($"RPE {rpe.ToString(CultureInfo.InvariantCulture)}");
        if (p.Rir is { } rir)
            parts.Add($"RIR {rir.ToString(CultureInfo.InvariantCulture)}");
        if (p.WorkTime is { } time)
            parts.Add("Work " + Q(time));
        if (p.Rest is { } rest)
            parts.Add("Rest " + Q(rest));
        if (p.Distance is { } distance)
            parts.Add(Q(distance));
        if (p.Tempo is { } tempo)
            parts.Add("Tempo " + tempo);
        if (formula != null)
            parts.Add($"Formula v{formula.Version}: {formula.Expression} = {Q(formula.Result)}; inputs: {string.Join(", ", formula.Inputs.Select(x => x.Key + "=" + Q(x.Value)))}");
        if (!string.IsNullOrEmpty(p.Comment))
            parts.Add(p.Comment);
        return string.Join(" | ", parts);
    }
    private sealed class EmbeddedFontResolver : IFontResolver
    {
        public FontResolverInfo? ResolveTypeface(string familyName, bool bold, bool italic) => familyName == "TrainFlow Noto Sans" ? new("noto-sans", false, false) : null;
        public byte[]? GetFont(string faceName)
        {
            if (faceName != "noto-sans")
                return null;
            using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("TrainFlow.Training.Infrastructure.Fonts.NotoSans-Regular.ttf") ?? throw new InvalidOperationException("Bundled PDF font is missing.");
            using var memory = new MemoryStream();
            stream.CopyTo(memory);
            return memory.ToArray();
        }
    }
}

public static class PdfTextLayout
{
    public static string[] Wrap(string text, double maximumWidth, Func<string, double> measure)
    {
        var lines = new List<string>();
        foreach (var paragraph in text.Replace("\r", "").Split('\n'))
        {
            var remaining = paragraph;
            while (measure(remaining) > maximumWidth)
            {
                var low = 1;
                var high = remaining.Length;
                while (low < high)
                {
                    var mid = (low + high + 1) / 2;
                    if (measure(remaining[..mid]) <= maximumWidth)
                        low = mid;
                    else
                        high = mid - 1;
                }
                var breakAt = remaining.LastIndexOf(' ', low - 1, low);
                if (breakAt <= 0)
                    breakAt = low;
                lines.Add(remaining[..breakAt]);
                remaining = remaining[breakAt..].TrimStart();
            }
            lines.Add(remaining);
        }
        return lines.ToArray();
    }
}
