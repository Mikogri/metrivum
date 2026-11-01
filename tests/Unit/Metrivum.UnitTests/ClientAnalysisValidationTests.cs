using Metrivum.BuildingBlocks;
using Metrivum.VideoAnalysis;
namespace Metrivum.UnitTests;

public sealed class ClientAnalysisValidationTests
{
    private static SaveClientAnalysisRequest Request() => new(Guid.NewGuid(), "client", "Lift", null, [], new(),
        new("local", 10, 1920, 1080), new(1, "engine", "model", "tracking", "px", null, [], [new(1, 2, 3, null, 1, false)], []));
    [Fact]
    public void Rejects_nonfinite_null_oversized_and_unordered_results()
    {
        var valid = Request();
        ClientAnalysisLibrary.Validate(valid, new());
        var invalid = new[]
        {
            valid with { Result = valid.Result with { Trajectory = [new(double.NaN, 0, 0, null, 1, false)] } },
            valid with { Result = valid.Result with { Trajectory = [null!] } },
            valid with { Result = valid.Result with { Repetitions = [null!] } },
            valid with { Result = valid.Result with { Trajectory = [new(2, 0, 0, null, 1, false), new(1, 0, 0, null, 1, false)] } },
            valid with { Result = valid.Result with { Trajectory = [new(11, 0, 0, null, 1, false)] } },
            valid with { Result = valid.Result with { Repetitions = [new(1, 2, 4, []), new(2, 3, 5, [])] } },
            valid with { SourceVideo = valid.SourceVideo with { DurationSeconds = double.PositiveInfinity } },
            valid with { SetId = Guid.NewGuid() },
            valid with { Result = valid.Result with { Warnings = [new string('x', 501)] } }
        };
        foreach (var input in invalid) Assert.Throws<ApiException>(() => ClientAnalysisLibrary.Validate(input, new()));
    }

    [Fact]
    public void Accepts_any_exercise_label_on_an_engine_movement()
    {
        var valid = Request();
        ClientAnalysisLibrary.Validate(valid with { Configuration = new(Movement: "squat", Exercise: "Front squat") }, new());
        ClientAnalysisLibrary.Validate(valid with { Configuration = new(Exercise: "Overhead press") }, new());
        Assert.Throws<ApiException>(() => ClientAnalysisLibrary.Validate(valid with { Configuration = new(Movement: "overhead-press") }, new()));
        Assert.Throws<ApiException>(() => ClientAnalysisLibrary.Validate(valid with { Configuration = new(Exercise: new string('x', 201)) }, new()));
        Assert.Throws<ApiException>(() => ClientAnalysisLibrary.Validate(valid with { Configuration = new(Exercise: "  ") }, new()));
    }
    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    public void Accepts_repeated_phase_kinds_but_rejects_overlapping_intervals(int count)
    {
        var valid = Request();
        var phases = Enumerable.Range(0, count * 2)
            .Select(i => new AnalysisPhase(i % 2 == 0 ? "concentric" : "eccentric", i, i + 1)).ToArray();
        var input = valid with { Result = valid.Result with { Repetitions = [new(1, 0, count * 2, phases)] } };
        ClientAnalysisLibrary.Validate(input, new());
        var overlapping = phases.ToArray();
        overlapping[1] = overlapping[1] with { StartSeconds = .5 };
        Assert.Throws<ApiException>(() => ClientAnalysisLibrary.Validate(input with {
            Result = input.Result with { Repetitions = [new(1, 0, count * 2, overlapping)] }
        }, new()));
    }
}
