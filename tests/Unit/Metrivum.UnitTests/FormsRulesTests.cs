using System.Text.Json;
using Metrivum.Accounts.Contracts;
using Metrivum.Accounts.Domain;
using Metrivum.BuildingBlocks;
using Metrivum.Forms.Contracts;
using Metrivum.Forms.Domain;

namespace Metrivum.UnitTests;

public sealed class FormsRulesTests
{
    private static FormDefinition Definition(params FormQuestion[] questions) => new([new("main", "Main", 0, questions)]);
    private static Dictionary<string, JsonElement> Answers(string json) => JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;
    [Fact]
    public void Validates_every_supported_answer_type_and_required_false_boolean()
    {
        var d = Definition(new FormQuestion("short", "Text", QuestionType.ShortText, true), new("long", "Notes", QuestionType.LongText), new("number", "Number", QuestionType.Number, Min: 0, Max: 100), new("bool", "Yes/no", QuestionType.YesNo, true), new("single", "Choice", QuestionType.SingleChoice, Choices: [new("a", "A")]), new("multi", "Choices", QuestionType.MultiChoice, Choices: [new("a", "A"), new("b", "B")]), new("scale", "Scale", QuestionType.Scale, Min: 1, Max: 5), new("date", "Date", QuestionType.Date));
        FormRules.ValidateDefinition(FormPurpose.Application, "Intake", "", d);
        FormRules.ValidateAnswers(d, Answers("""{"short":"hello","long":"notes","number":20.5,"bool":false,"single":"a","multi":["a","b"],"scale":4,"date":"2026-10-06"}"""));
    }
    [Theory]
    [InlineData("{}")]
    [InlineData("{\"weight\":null}")]
    [InlineData("{\"weight\":\"20\"}")]
    [InlineData("{\"weight\":101}")]
    [InlineData("{\"weight\":20,\"unknown\":false}")]
    public void Rejects_missing_wrong_type_bounds_and_unknown_answers(string json) => Assert.Throws<ApiException>(() => FormRules.ValidateAnswers(Definition(new FormQuestion("weight", "Weight", QuestionType.Number, true, Min: 0, Max: 100)), Answers(json)));
    [Theory]
    [InlineData("{\"q\":[\"a\",\"a\"]}")]
    [InlineData("{\"q\":[\"unknown\"]}")]
    [InlineData("{\"q\":[]}")]
    public void Rejects_invalid_choice_sets(string json) => Assert.Throws<ApiException>(() => FormRules.ValidateAnswers(Definition(new FormQuestion("q", "Choice", QuestionType.MultiChoice, true, Choices: [new("a", "A")])), Answers(json)));
    [Fact]
    public void System_mapping_is_application_only_allowlisted_unique_and_typed()
    {
        var q = new FormQuestion("height", "Height", QuestionType.Number, SystemField: SystemFieldKey.Height);
        FormRules.ValidateDefinition(FormPurpose.Application, "Intake", "", Definition(q));
        Assert.Throws<ApiException>(() => FormRules.ValidateDefinition(FormPurpose.CheckIn, "Check-in", "", Definition(q)));
        Assert.Throws<ApiException>(() => FormRules.ValidateDefinition(FormPurpose.Application, "Intake", "", Definition(q with { Type = QuestionType.LongText })));
        Assert.Throws<ApiException>(() => FormRules.ValidateDefinition(FormPurpose.Application, "Intake", "", Definition(q, q with { Key = "other" })));
        Assert.Throws<ApiException>(() => FormRules.ValidateDefinition(FormPurpose.Application, "Intake", "", Definition(q with { SystemField = (SystemFieldKey)200 })));
    }
    [Fact]
    public void Profile_rules_reject_arbitrary_fields_wrong_types_and_implausible_values()
    {
        Assert.Throws<ApiException>(() => SystemFieldRules.Validate(new Dictionary<SystemFieldKey, JsonElement> { [(SystemFieldKey)999] = JsonSerializer.SerializeToElement("secret") }));
        Assert.Throws<ApiException>(() => SystemFieldRules.Validate(new Dictionary<SystemFieldKey, JsonElement> { [SystemFieldKey.Weight] = JsonSerializer.SerializeToElement(-1) }));
        Assert.Throws<ApiException>(() => SystemFieldRules.Validate(new Dictionary<SystemFieldKey, JsonElement> { [SystemFieldKey.PreferredTrainingDays] = JsonSerializer.SerializeToElement(new[] { "Monday" }) }));
        SystemFieldRules.Validate(new Dictionary<SystemFieldKey, JsonElement> { [SystemFieldKey.Weight] = JsonSerializer.SerializeToElement(80), [SystemFieldKey.AdditionalNotes] = JsonSerializer.SerializeToElement("Private") });
        SystemFieldRules.Validate(new Dictionary<SystemFieldKey, JsonElement> { [SystemFieldKey.Country] = JsonSerializer.SerializeToElement("PL"), [SystemFieldKey.City] = JsonSerializer.SerializeToElement("Kraków"), [SystemFieldKey.PostalCode] = JsonSerializer.SerializeToElement("30-001") });
        Assert.Throws<ApiException>(() => SystemFieldRules.Validate(new Dictionary<SystemFieldKey, JsonElement> { [SystemFieldKey.Country] = JsonSerializer.SerializeToElement("Poland") }));
        Assert.Throws<ApiException>(() => SystemFieldRules.Validate(new Dictionary<SystemFieldKey, JsonElement> { [SystemFieldKey.PostalCode] = JsonSerializer.SerializeToElement(new string('9', 17)) }));
    }
    [Fact]
    public void Attachments_duplicate_keys_and_fractional_scales_are_rejected()
    {
        var q = new FormQuestion("q", "Question", QuestionType.ShortText);
        Assert.Throws<ApiException>(() => FormRules.ValidateDefinition(FormPurpose.CheckIn, "Review", "", Definition(q, q)));
        Assert.Equal("FILE_ATTACHMENT_UNSUPPORTED", Assert.Throws<ApiException>(() => FormRules.ValidateDefinition(FormPurpose.CheckIn, "Review", "", Definition(q with { Type = QuestionType.FileAttachment }))).Code);
        Assert.Throws<ApiException>(() => FormRules.ValidateAnswers(Definition(new FormQuestion("q", "Scale", QuestionType.Scale, Min: 1, Max: 5)), Answers("{\"q\":1.5}")));
    }
    [Fact]
    public void Canonical_answers_normalize_equivalent_numeric_spellings()
    {
        Assert.Equal(FormRules.CanonicalAnswers(Answers("{\"weight\":80}")), FormRules.CanonicalAnswers(Answers("{\"weight\":8e1}")));
        Assert.Equal(FormRules.CanonicalAnswers(Answers("{\"weight\":80}")), FormRules.CanonicalAnswers(Answers("{\"weight\":80.0000}")));
    }
    [Fact]
    public void Profile_mapping_ignores_custom_questions_and_maps_day_keys()
    {
        var d = Definition(new FormQuestion("days", "Days", QuestionType.MultiChoice, Choices: [new("1", "Monday")], SystemField: SystemFieldKey.PreferredTrainingDays), new("custom", "Private custom", QuestionType.ShortText));
        var mapped = FormRules.ProfileAnswers(d, Answers("{\"days\":[\"1\"],\"custom\":\"never saved\"}"));
        Assert.Single(mapped);
        Assert.Equal(1, mapped[SystemFieldKey.PreferredTrainingDays][0].GetInt32());
        SystemFieldRules.Validate(mapped);
    }
}
