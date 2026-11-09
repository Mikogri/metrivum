using System.Text;
using System.Text.RegularExpressions;

namespace Metrivum.ExerciseCatalog.Domain;

/// <summary>Normalizes catalog names and validates dictionary keys before queries or writes.</summary>
public static partial class CatalogText
{
    public static string Clean(string value) => Whitespace().Replace(value.Normalize(NormalizationForm.FormKC).Trim(), " ");
    public static string Normalize(string value) => Clean(value).ToUpperInvariant();
    public static bool IsDictionaryKey(string value) => value.Length <= 80 && DictionaryKey().IsMatch(value);

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
    [GeneratedRegex(@"\A[a-z][a-z0-9]*(?:-[a-z0-9]+)*\z")]
    private static partial Regex DictionaryKey();
}
