using TrainFlow.BuildingBlocks;
using TrainFlow.VideoAnalysis;
namespace TrainFlow.UnitTests;

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
}
