using System.Text.Json;
using Metrivum.Accounts.Domain;
using Metrivum.BuildingBlocks;

namespace Metrivum.UnitTests;

public sealed class CoverStyleRulesTests
{
    private static JsonElement Json(string text) => JsonDocument.Parse(text).RootElement;

    [Fact]
    public void Accepts_a_background_with_plain_settings_and_null_resets()
    {
        Assert.Null(CoverStyleRules.Validate(null));
        var stored = CoverStyleRules.Validate(Json("""{"background":"Silk","props":{"speed":2.5,"color":"#55534f","mouseInteraction":false,"colors":["#111111","#ffffff"],"mode":"soft"},"backdrop":"#151514"}"""));
        Assert.Contains("Silk", stored);
        Assert.Equal("Silk", CoverStyleRules.Parse(stored)!.Value.GetProperty("background").GetString());
    }

    [Theory]
    [InlineData("""{"props":{}}""")]
    [InlineData("""{"background":"<script>"}""")]
    [InlineData("""{"background":"Silk","extra":1}""")]
    [InlineData("""{"background":"Silk","backdrop":"red"}""")]
    [InlineData("""{"background":"Silk","props":{"imageSrc":"https://tracker.example/pixel.png"}}""")]
    [InlineData("""{"background":"Silk","props":{"nested":{"a":1}}}""")]
    [InlineData("""{"background":"Silk","props":{"count":10000000}}""")]
    [InlineData("""{"background":"Silk","props":{"list":[1,2,3,4,5,6,7,8,9]}}""")]
    public void Rejects_unknown_shapes_urls_and_oversized_values(string json) =>
        Assert.Throws<ApiException>(() => CoverStyleRules.Validate(Json(json)));
}
