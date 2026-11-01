using Metrivum.BuildingBlocks;
using Metrivum.Media;
using Metrivum.VideoAnalysis;

namespace Metrivum.UnitTests;

public class MediaAnalysisTests
{
    [Fact]
    public void QuickTimeContainerIsAcceptedButDisguisedBytesAreRejected()
    {
        Assert.Equal("mov", VideoFileValidation.Extension("video/quicktime"));
        var header = new byte[] { 0, 0, 0, 20 }.Concat("ftypqt  "u8.ToArray()).Concat(new byte[8]).ToArray();
        VideoFileValidation.Validate("video/quicktime", 100, 100, header, 1000);
        var legacy = new byte[] { 0, 0, 0, 8 }.Concat("wide"u8.ToArray()).Concat(new byte[8]).ToArray();
        VideoFileValidation.Validate("video/quicktime", 100, 100, legacy, 1000);
        header[0] = 255;
        Assert.Throws<ApiException>(() => VideoFileValidation.Validate("video/quicktime", 100, 100, header, 1000));
        Assert.Throws<ApiException>(() => VideoFileValidation.Validate("video/quicktime", 100, 100, "this is not a movie"u8.ToArray(), 1000));
    }

    [Fact]
    public void DeclaredVideoWithNonVideoBytesIsRejected()
    {
        var error = Assert.Throws<ApiException>(() => VideoFileValidation.Validate("video/mp4", 100, 100, "not video"u8.ToArray(), 1000));
        Assert.Equal("MEDIA_FORMAT_INVALID", error.Code);
    }

    [Fact]
    public void ActualObjectSizeMustMatchReservation()
    {
        var error = Assert.Throws<ApiException>(() => VideoFileValidation.Validate("video/mp4", 100, 101, new byte[16], 1000));
        Assert.Equal("MEDIA_SIZE_INVALID", error.Code);
    }

    [Fact]
    public async Task DefaultAnalyzerCannotProduceFictionalResult()
    {
        var engine = new UnavailableVideoAnalyzer();
        Assert.False(engine.IsConfigured);
        var error = await Assert.ThrowsAsync<ApiException>(() => engine.AnalyzeAsync(Stream.Null, new AnalysisConfiguration(), CancellationToken.None));
        Assert.Equal("ANALYZER_NOT_CONFIGURED", error.Code);
    }

    [Fact]
    public void PixelAndMetricResultsCannotBeCompared()
    {
        var a = Result("px", null);
        var b = Result("m", 0.01);
        Assert.Equal("ANALYSIS_INCOMPATIBLE", Assert.Throws<ApiException>(() => AnalysisResults.RequireCompatible(a, b)).Code);
    }

    [Fact]
    public void DownsamplingIsBoundedAndKeepsBothEndpoints()
    {
        var points = Enumerable.Range(0, 1000).Select(i => new TrajectoryPoint(i, i, i, null, 1, false)).ToArray();
        var sampled = AnalysisResults.Sample(points, 50);
        Assert.Equal(50, sampled.Length);
        Assert.Equal(points[0], sampled[0]);
        Assert.Equal(points[^1], sampled[^1]);
    }

    [Fact]
    public void MetricResultsRequireCalibration()
    {
        Assert.Equal("ANALYSIS_RESULT_INVALID", Assert.Throws<ApiException>(() => AnalysisResults.Validate(Result("m", null), new AnalysisOptions())).Code);
    }

    private static AnalysisResult Result(string units, double? scale) => new(1, "engine", "model", "method", units, scale, [], [], []);

    [Fact]
    public void Human_rep_review_preserves_measured_results_and_can_be_cleared()
    {
        var rep = new AnalysisRepetition(1, 0, 2, [], 123, 234);
        var result = Result("px", null) with { Repetitions = [rep, rep with { Number = 2 }] };
        var reviewed = AnalysisResults.Review(result, [new(1, false)]);
        Assert.False(reviewed.Repetitions[0].Performed);
        Assert.Null(reviewed.Repetitions[1].Performed);
        Assert.Equal(rep.MeanSpeed, reviewed.Repetitions[0].MeanSpeed);
        Assert.Null(result.Repetitions[0].Performed);
        Assert.True(AnalysisResults.Review(reviewed, [new(1, true)]).Repetitions[0].Performed);
        Assert.Null(AnalysisResults.Review(reviewed, [new(1, null)]).Repetitions[0].Performed);
        Assert.Throws<ApiException>(() => AnalysisResults.Review(result, [new(3, true)]));
        Assert.Throws<ApiException>(() => AnalysisResults.Review(result, [new(1, true), new(1, false)]));
    }
}
