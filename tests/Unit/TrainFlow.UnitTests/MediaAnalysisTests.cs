using TrainFlow.BuildingBlocks;
using TrainFlow.Media;
using TrainFlow.VideoAnalysis;

namespace TrainFlow.UnitTests;

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
}
