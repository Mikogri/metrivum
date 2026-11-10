using System.Text.Json;
using System.Text.RegularExpressions;
using Metrivum.BuildingBlocks;

namespace Metrivum.Accounts.Domain;

/// <summary>
/// Bounds for the stored cover style. The app renders only backgrounds and settings it knows and clamps every value,
/// so the server just keeps the document small and made of plain values (no URLs or free text).
/// </summary>
public static partial class CoverStyleRules
{
    private const int MaxBytes = 4096;

    public static string? Validate(JsonElement? style)
    {
        if (style is null || style.Value.ValueKind == JsonValueKind.Null)
            return null;
        var value = style.Value;
        if (
            value.ValueKind != JsonValueKind.Object
            || !value.TryGetProperty("background", out var background)
            || background.ValueKind != JsonValueKind.String
            || !Name().IsMatch(background.GetString()!)
        )
            throw ApiException.Invalid("The cover needs a background name.");
        if (value.EnumerateObject().Any(p => p.Name is not ("background" or "props" or "backdrop")))
            throw ApiException.Invalid(
                "The cover holds only a background, its settings and the banner colour."
            );
        if (
            value.TryGetProperty("backdrop", out var backdrop)
            && (
                backdrop.ValueKind != JsonValueKind.String
                || !Backdrop().IsMatch(backdrop.GetString()!)
            )
        )
            throw ApiException.Invalid("The banner colour must be a #rrggbb colour.");
        if (value.TryGetProperty("props", out var props))
        {
            if (props.ValueKind != JsonValueKind.Object || props.EnumerateObject().Count() > 60)
                throw ApiException.Invalid(
                    "Cover settings must be an object of at most 60 values."
                );
            foreach (var prop in props.EnumerateObject())
                if (!Name().IsMatch(prop.Name) || !Plain(prop.Value, true))
                    throw ApiException.Invalid(
                        "Cover settings accept numbers, true/false, colours and short options only."
                    );
        }
        var json = value.GetRawText();
        if (System.Text.Encoding.UTF8.GetByteCount(json) > MaxBytes)
            throw ApiException.Invalid("The cover settings are too large.");
        return json;
    }

    public static JsonElement? Parse(string? stored) =>
        stored is null ? null : JsonDocument.Parse(stored).RootElement.Clone();

    private static bool Plain(JsonElement value, bool allowArray) =>
        value.ValueKind switch
        {
            JsonValueKind.True or JsonValueKind.False => true,
            JsonValueKind.Number => value.TryGetDouble(out var n)
                && double.IsFinite(n)
                && Math.Abs(n) <= 1_000_000,
            JsonValueKind.String => Option().IsMatch(value.GetString()!),
            JsonValueKind.Array => allowArray
                && value.GetArrayLength() <= 8
                && value.EnumerateArray().All(x => Plain(x, false)),
            _ => false,
        };

    [GeneratedRegex("^[A-Za-z][A-Za-z0-9]{1,39}$")]
    private static partial Regex Name();

    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex Backdrop();

    [GeneratedRegex("^(#[0-9A-Fa-f]{3,8}|[A-Za-z0-9 _-]{1,32})$")]
    private static partial Regex Option();
}
