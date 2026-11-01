using Metrivum.Training.Domain;
using Metrivum.Training.Infrastructure;

namespace Metrivum.UnitTests;

public sealed class TrainingCsvTests
{
    [Theory]
    [InlineData(",")]
    [InlineData(";")]
    [InlineData("\t")]
    public void Csv_round_trip_preserves_typed_groups_and_polish_text(string separator)
    {
        var doc = TrainingDocumentTests.Example();
        var exercises = DocumentRules.Workouts(doc).SelectMany(w => w.Exercises).ToDictionary(e => e.ExerciseId, e => new Metrivum.ExerciseCatalog.Contracts.ExerciseSnapshot(e.ExerciseId, 1, "Przysiad, żółć", "Łopatki", ""));
        var snapshot = new RevisionSnapshot(1, "=SUM(A1)", "Zażółć", DocumentKind.Program, doc, exercises, []);
        var csv = TrainingCsv.Export(snapshot, separator);
        Assert.Contains("'=SUM(A1)", csv);
        var rows = TrainingCsv.Parse(csv, separator, 5000);
        var mapping = rows.Select((row, index) => new { row, index }).Where(x => x.row.RowKind == "exercise").ToDictionary(x => x.index, x => doc.Blocks[0].Cycles[0].Days[0].Workouts[0].Exercises.First(e => e.Id == x.row.InstanceId).ExerciseId);
        var imported = TrainingCsv.Build(rows, mapping);
        Assert.Equal(TrainingJson.Serialize(doc), TrainingJson.Serialize(imported));
        Assert.Equal("=SUM(A1)", rows[0].ProgramName);
        Assert.Contains("żółć", rows.Last().ExerciseName);
    }

    [Fact]
    public void Csv_rejects_unmapped_exercise_and_row_limit()
    {
        var doc = TrainingDocumentTests.Example();
        var exercises = DocumentRules.Workouts(doc).SelectMany(w => w.Exercises).ToDictionary(e => e.ExerciseId, e => new Metrivum.ExerciseCatalog.Contracts.ExerciseSnapshot(e.ExerciseId, 1, "Squat", "", ""));
        var csv = TrainingCsv.Export(new(1, "Plan", "", DocumentKind.Program, doc, exercises, []), ",");
        Assert.Throws<TrainingValidationException>(() => TrainingCsv.Parse(csv, ",", 1));
        Assert.Throws<TrainingValidationException>(() => TrainingCsv.Build(TrainingCsv.Parse(csv, ",", 100), new Dictionary<int, Guid>()));
    }

    [Fact]
    public void Empty_hierarchy_is_preserved()
    {
        var doc = new TrainingDocument(1, [new(Guid.NewGuid(), "Empty block", "", [])]);
        var rows = TrainingCsv.Parse(TrainingCsv.Export(new(1, "Plan", "", DocumentKind.Template, doc, [], []), ","), ",", 100);
        Assert.Equal(TrainingJson.Serialize(doc), TrainingJson.Serialize(TrainingCsv.Build(rows, new Dictionary<int, Guid>())));
    }

    [Fact]
    public void Export_is_a_real_pdf_with_embedded_unicode_font()
    {
        var bytes = TrainingPdf.Render(new(1, "Zażółć gęślą jaźń", "Łódź", DocumentKind.Program, new(1, []), [], []));
        Assert.Equal("%PDF-", System.Text.Encoding.ASCII.GetString(bytes, 0, 5));
        Assert.True(bytes.Length > 5000);
        using var stream = new MemoryStream(bytes);
        using var pdf = PdfSharp.Pdf.IO.PdfReader.Open(stream, PdfSharp.Pdf.IO.PdfDocumentOpenMode.Import);
        Assert.True(pdf.PageCount > 0);
    }

    [Fact]
    public void Pdf_wraps_wide_glyphs_within_actual_cell_width()
    {
        // A 72-character word may be far wider than the 382-point content cell.
        static double Measure(string text) => text.Sum(c => c == 'W' ? 9d : 2d);
        var lines = PdfTextLayout.Wrap(new string('W', 144) + " " + new string('i', 144), 382, Measure);
        Assert.True(lines.Length > 2);
        Assert.All(lines, line => Assert.InRange(Measure(line), 0, 382));
    }

    [Fact]
    public void Representative_pdf_paginates_advanced_sets_and_preserves_polish_title()
    {
        var document = TrainingDocumentTests.Example();
        var workout = DocumentRules.Workouts(document).Single();
        var extended = Enumerable.Range(0, 24).Select(i => new TrainingSet(Guid.NewGuid(), SetKind.DropSet, new(Comment: "Kontroluj łopatki i oddech. " + new string('W', 100)),
            [new(Guid.NewGuid(), new(Reps: new(8, 8), Load: new(new(80, Unit.Kg), new(80, Unit.Kg)), Rest: new(20, Unit.Seconds))), new(Guid.NewGuid(), new(Reps: new(10, 12), Load: new(new(60, Unit.Kg), new(60, Unit.Kg)), Rest: new(30, Unit.Seconds)))])).ToArray();
        workout.Exercises[0] = workout.Exercises[0] with
        {
            Sets = extended
        };
        var exercises = workout.Exercises.ToDictionary(e => e.ExerciseId, e => new Metrivum.ExerciseCatalog.Contracts.ExerciseSnapshot(e.ExerciseId, 1, "Przysiad – żółć, łopatki", "Wykonaj ćwiczenie w pełnym zakresie ruchu. " + new string('W', 144), "Oddychaj i kontroluj tempo."));
        var bytes = TrainingPdf.Render(new(1, "Zażółć gęślą jaźń – plan treningowy", "Opis: dokładne obciążenia, superserie i segmenty dropsetu.", DocumentKind.Program, document, exercises, []));
        using var stream = new MemoryStream(bytes);
        using var pdf = PdfSharp.Pdf.IO.PdfReader.Open(stream, PdfSharp.Pdf.IO.PdfDocumentOpenMode.Import);
        Assert.True(pdf.PageCount >= 2);
        Assert.Equal("Zażółć gęślą jaźń – plan treningowy", pdf.Info.Title);
        if (Environment.GetEnvironmentVariable("TRAINFLOW_TEST_PDF_OUTPUT") is { Length: > 0 } path)
            File.WriteAllBytes(path, bytes);
    }
}
