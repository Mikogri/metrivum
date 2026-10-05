using TrainFlow.ExerciseCatalog.Domain;

namespace TrainFlow.UnitTests;

public sealed class CatalogRulesTests
{
    [Theory]
    [InlineData("  Back\t  squat\n", "BACK SQUAT")]
    [InlineData("Cafe\u0301 squat", "CAFÉ SQUAT")]
    [InlineData("Ｂｅｎｃｈ\u00a0press", "BENCH PRESS")]
    [InlineData("Żółć", "ŻÓŁĆ")]
    public void Name_identity_normalizes_unicode_case_and_whitespace(string value, string expected)
        => Assert.Equal(expected, CatalogText.Normalize(value));

    [Fact]
    public void Display_text_preserves_case_and_does_not_translate_names()
    {
        Assert.Equal("Back squat", CatalogText.Clean(" Back\t squat "));
        Assert.NotEqual(CatalogText.Normalize("Back squat"), CatalogText.Normalize("Przysiad"));
    }

    [Theory]
    [InlineData("upper-back", true)]
    [InlineData("hip_hinge", false)]
    [InlineData("Upper-Back", false)]
    [InlineData("", false)]
    [InlineData("-back", false)]
    [InlineData("upper-back\n", false)]
    public void Dictionary_keys_are_stable_lowercase_slugs(string key, bool expected)
        => Assert.Equal(expected, CatalogText.IsDictionaryKey(key));
}
