using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Forms.Contracts;

namespace TrainFlow.Forms.Domain;

public static class FormRules
{
    public static void ValidateDefinition(FormPurpose purpose, string name, string description, FormDefinition definition)
    {
        if (!Enum.IsDefined(purpose) || string.IsNullOrWhiteSpace(name) || name.Length > 200 || description is null || description.Length > 4000)
            throw ApiException.Invalid("A supported purpose, name up to 200 characters and description up to 4000 characters are required.");
        if (definition?.Sections is null || definition.Sections.Count is < 1 or > 30 || definition.Sections.Any(s => s is null || s.Questions is null) || definition.Sections.Sum(s => s.Questions.Count) is < 1 or > 200)
            throw ApiException.Invalid("A form must contain 1–30 sections and 1–200 questions.");
        var keys = new HashSet<string>(StringComparer.Ordinal);
        var sectionKeys = new HashSet<string>(StringComparer.Ordinal);
        var systemKeys = new HashSet<SystemFieldKey>();
        foreach (var section in definition.Sections)
        {
            if (!Key(section.Key) || !sectionKeys.Add(section.Key) || string.IsNullOrWhiteSpace(section.Title) || section.Title.Length > 200 || section.Description?.Length > 4000 || section.Order < 0)
                throw ApiException.Invalid("Invalid section key, title or order.");
            foreach (var q in section.Questions)
            {
                if (q is null || !Key(q.Key) || !keys.Add(q.Key) || string.IsNullOrWhiteSpace(q.Label) || q.Label.Length > 500 || q.HelpText?.Length > 4000 || q.Unit?.Length > 50 || q.MinLabel?.Length > 100 || q.MaxLabel?.Length > 100 || q.Order < 0 || !Enum.IsDefined(q.Type))
                    throw ApiException.Invalid("Invalid question key, label, type or configuration.");
                if (q.Type == QuestionType.FileAttachment)
                    throw new ApiException(400, "FILE_ATTACHMENT_UNSUPPORTED", "File attachment questions are unavailable until authorized Media review is supported.");
                if (q.Min > q.Max || q.MaxLength is < 1 or > 20000 || q.MinSelections < 0 || q.MaxSelections < 1 || q.MinSelections > q.MaxSelections)
                    throw ApiException.Invalid("Invalid question bounds.");
                if (q.Type == QuestionType.Scale && (q.Min is null || q.Max is null || q.Min == q.Max || decimal.Truncate(q.Min.Value) != q.Min || decimal.Truncate(q.Max.Value) != q.Max || q.Min < -1000 || q.Max > 1000))
                    throw ApiException.Invalid("A scale requires integer min/max between -1000 and 1000.");
                if (q.Type is QuestionType.SingleChoice or QuestionType.MultiChoice)
                {
                    if (q.Choices is null || q.Choices.Count is < 1 or > 100 || q.Choices.Any(c => c is null || !Key(c.Key) || string.IsNullOrWhiteSpace(c.Label) || c.Label.Length > 500) || q.Choices.Select(c => c.Key).Distinct(StringComparer.Ordinal).Count() != q.Choices.Count || q.MaxSelections > q.Choices.Count || q.MinSelections > q.Choices.Count)
                        throw ApiException.Invalid("Choice questions require bounded unique choices and selection limits.");
                }
                else if (q.Choices?.Count > 0 || q.MinSelections is not null || q.MaxSelections is not null)
                    throw ApiException.Invalid("Choice configuration is only allowed for choice questions.");
                if (q.Type == QuestionType.SingleChoice && (q.MinSelections is not null || q.MaxSelections is not null))
                    throw ApiException.Invalid("Selection limits apply only to MultiChoice questions.");
                if (q.Type != QuestionType.Scale && (q.MinLabel is not null || q.MaxLabel is not null))
                    throw ApiException.Invalid("Endpoint labels require a Scale question.");
                if (q.Type is not (QuestionType.Number or QuestionType.Scale) && (q.Min is not null || q.Max is not null || q.Unit is not null))
                    throw ApiException.Invalid("Numeric configuration requires a Number or Scale question.");
                if (q.Type is not (QuestionType.ShortText or QuestionType.LongText) && q.MaxLength is not null)
                    throw ApiException.Invalid("Text limits require a text question.");
                if (q.SystemField is { } system)
                {
                    if (purpose != FormPurpose.Application || !Enum.IsDefined(system) || !systemKeys.Add(system))
                        throw ApiException.Invalid("System fields are unique allowlisted Application fields.");
                    var valid = system switch
                    {
                        SystemFieldKey.Height or SystemFieldKey.Weight or SystemFieldKey.BodyFat or SystemFieldKey.HrMax or SystemFieldKey.SessionsPerWeek or SystemFieldKey.AvailableSessionDuration or SystemFieldKey.Sleep or SystemFieldKey.Stress => q.Type is QuestionType.Number or QuestionType.Scale,
                        SystemFieldKey.PreferredTrainingDays or SystemFieldKey.AvailableEquipment => q.Type == QuestionType.MultiChoice,
                        SystemFieldKey.Sex => q.Type == QuestionType.SingleChoice && q.Choices is { Count: > 0 } && q.Choices.All(c => c.Key is "Male" or "Female" or "Other"),
                        _ => q.Type is QuestionType.ShortText or QuestionType.LongText or QuestionType.SingleChoice
                    };
                    if (!valid)
                        throw ApiException.Invalid("System field and question type are incompatible.");
                    if (system == SystemFieldKey.PreferredTrainingDays && (q.Choices is null || q.Choices.Any(c => !int.TryParse(c.Key, out var day) || day < 1 || day > 7 || c.Key != day.ToString(CultureInfo.InvariantCulture))))
                        throw ApiException.Invalid("Preferred training day choices use ISO weekday keys 1–7.");
                }
            }
        }
        if (JsonSerializer.Serialize(definition).Length > 250000)
            throw ApiException.Invalid("Form definition is too large.");
    }
    public static void ValidateAnswers(FormDefinition definition, IReadOnlyDictionary<string, JsonElement> answers)
    {
        if (answers is null || answers.Count > 200 || JsonSerializer.Serialize(answers).Length > 500000)
            throw ApiException.Invalid("Submission is too large.");
        var questions = definition.Sections.SelectMany(s => s.Questions).ToDictionary(q => q.Key, StringComparer.Ordinal);
        if (answers.Keys.Any(k => !questions.ContainsKey(k)))
            throw ApiException.Invalid("Submission contains an unknown question.");
        foreach (var q in questions.Values)
        {
            if (!answers.TryGetValue(q.Key, out var value) || value.ValueKind == JsonValueKind.Null)
            {
                if (q.Required)
                    throw ApiException.Invalid($"An answer is required for {q.Key}.");
                continue;
            }
            var valid = q.Type switch
            {
                QuestionType.ShortText or QuestionType.LongText => value.ValueKind == JsonValueKind.String && value.GetString()!.Length <= (q.MaxLength ?? (q.Type == QuestionType.ShortText ? 500 : 10000)) && (!q.Required || !string.IsNullOrWhiteSpace(value.GetString())),
                QuestionType.Number or QuestionType.Scale => value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number) && (q.Min is null || number >= q.Min) && (q.Max is null || number <= q.Max) && (q.Type != QuestionType.Scale || decimal.Truncate(number) == number),
                QuestionType.YesNo => value.ValueKind is JsonValueKind.True or JsonValueKind.False,
                QuestionType.SingleChoice => value.ValueKind == JsonValueKind.String && q.Choices!.Any(c => c.Key == value.GetString()),
                QuestionType.MultiChoice => value.ValueKind == JsonValueKind.Array && value.GetArrayLength() >= Math.Max(q.Required ? 1 : 0, q.MinSelections ?? 0) && value.GetArrayLength() <= (q.MaxSelections ?? q.Choices!.Count) && value.EnumerateArray().All(v => v.ValueKind == JsonValueKind.String && q.Choices!.Any(c => c.Key == v.GetString())) && value.EnumerateArray().Select(v => v.GetString()).Distinct(StringComparer.Ordinal).Count() == value.GetArrayLength(),
                QuestionType.Date => value.ValueKind == JsonValueKind.String && DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _),
                _ => false
            };
            if (!valid)
                throw ApiException.Invalid($"Invalid answer for {q.Key}.");
        }
    }
    public static IReadOnlyDictionary<SystemFieldKey, JsonElement> ProfileAnswers(FormDefinition definition, IReadOnlyDictionary<string, JsonElement> answers)
    {
        var mapped = new Dictionary<SystemFieldKey, JsonElement>();
        foreach (var q in definition.Sections.SelectMany(s => s.Questions).Where(q => q.SystemField is not null))
            if (answers.TryGetValue(q.Key, out var value))
                mapped[q.SystemField!.Value] = q.SystemField == SystemFieldKey.PreferredTrainingDays && value.ValueKind == JsonValueKind.Array
                    ? JsonSerializer.SerializeToElement(value.EnumerateArray().Select(x => int.Parse(x.GetString()!, CultureInfo.InvariantCulture)).ToArray()) : value.Clone();
        return mapped;
    }
    public static string CanonicalAnswers(IReadOnlyDictionary<string, JsonElement> answers)
    {
        using var output = new MemoryStream();
        using (var writer = new Utf8JsonWriter(output))
        {
            writer.WriteStartObject();
            foreach (var (key, value) in answers.OrderBy(x => x.Key, StringComparer.Ordinal))
            {
                writer.WritePropertyName(key);
                // PostgreSQL jsonb normalizes numeric spelling, including exponent notation.
                if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number))
                    writer.WriteRawValue(number.ToString("G29", CultureInfo.InvariantCulture));
                else
                    value.WriteTo(writer);
            }
            writer.WriteEndObject();
        }
        return System.Text.Encoding.UTF8.GetString(output.ToArray());
    }
    private static bool Key(string? value) => value is not null && Regex.IsMatch(value, "^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$", RegexOptions.CultureInvariant);
}
