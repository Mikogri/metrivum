using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Accounts.Domain;

/// <summary>
/// The single source of the rules for public account identity: the username others search for and the
/// display name shown next to a person's content. Every write path (onboarding, role onboarding, profile
/// updates) goes through here; the database repeats the structural part as CHECK constraints.
/// </summary>
public static partial class AccountIdentityPolicy
{
    public const int UsernameMinLength = 3;
    public const int UsernameMaxLength = 32;
    public const int DisplayNameMaxLength = 100;
    public const int NamePartMaxLength = 50;

    /// <summary>Names a person could use to impersonate the service or its staff, compared case-insensitively.</summary>
    public static readonly IReadOnlySet<string> ReservedUsernames = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "admin", "administrator", "root", "system", "sysadmin", "superuser", "support", "help", "helpdesk",
        "staff", "team", "official", "moderator", "mod", "security", "abuse", "privacy", "legal", "billing",
        "payments", "noreply", "no_reply", "postmaster", "webmaster", "hostmaster", "mailer", "info", "contact",
        "api", "www", "app", "auth", "login", "logout", "signin", "signup", "register", "onboarding",
        "settings", "account", "accounts", "profile", "me", "null", "undefined", "anonymous", "unknown",
        "everyone", "all", "here", "owner", "coaches", "clients", "status", "test", "demo"
    };

    /// <summary>
    /// Usernames are public, ASCII and unambiguous: 3–32 letters, digits or single underscores, starting with a
    /// letter and not ending with an underscore. ASCII-only also rules out look-alike letters from other scripts.
    /// Uniqueness is case-insensitive (see <see cref="NormalizeUsername"/>).
    /// </summary>
    public static void ValidateUsername(string? username)
    {
        if (string.IsNullOrEmpty(username) || !UsernamePattern().IsMatch(username) || username.Contains("__", StringComparison.Ordinal))
            throw UsernameError("USERNAME_INVALID",
                $"Username must be {UsernameMinLength}-{UsernameMaxLength} characters: letters, digits and single underscores, starting with a letter and not ending with an underscore.");
        if (ReservedUsernames.Contains(username) || username.StartsWith("trainflow", StringComparison.OrdinalIgnoreCase)
            || username.StartsWith("metrivum", StringComparison.OrdinalIgnoreCase))
            throw UsernameError("USERNAME_RESERVED", "This username is reserved. Choose another one.");
    }

    /// <summary>The comparison key for uniqueness and exact lookups. Valid usernames are ASCII, so this is culture-free.</summary>
    public static string NormalizeUsername(string username) => username.ToUpperInvariant();

    /// <summary>
    /// Display names may use any script and emoji, but not characters that hide or reorder text: controls,
    /// line breaks, bidirectional overrides, zero-width characters (other than the emoji joiner), private-use
    /// code points or broken surrogates. Whitespace runs collapse to one space and the result is NFC.
    /// </summary>
    public static string NormalizeDisplayName(string? displayName) =>
        NormalizeName(displayName, "Display name", DisplayNameMaxLength, DisplayNameError);

    /// <summary>A first or last name: the same Unicode rules as the display name, at most 50 characters.</summary>
    public static string NormalizeNamePart(string? value, bool last) =>
        NormalizeName(value, last ? "Last name" : "First name", NamePartMaxLength,
            message => new ApiException(400, "NAME_INVALID", message, new Dictionary<string, string[]> { [last ? "lastName" : "firstName"] = [message] }));

    /// <summary>
    /// The name of an account from a request: first and last name when given (the display name is then built from them),
    /// otherwise the older single display name, split at its first space so both parts are still stored.
    /// </summary>
    public static (string DisplayName, string? FirstName, string? LastName) ResolveName(string? displayName, string? firstName, string? lastName)
    {
        if (firstName is not null || lastName is not null)
        {
            var first = NormalizeNamePart(firstName, last: false);
            var last = NormalizeNamePart(lastName, last: true);
            return (NormalizeDisplayName(first + " " + last), first, last);
        }
        var display = NormalizeDisplayName(displayName);
        var space = display.IndexOf(' ');
        return space < 0 ? (display, display.Length <= NamePartMaxLength ? display : null, null)
            : (display, Fit(display[..space]), Fit(display[(space + 1)..]));
        static string? Fit(string part) => part.Length <= NamePartMaxLength ? part : null;
    }

    private static string NormalizeName(string? value, string label, int maxLength, Func<string, ApiException> error)
    {
        if (value is null)
            throw error($"{label} is required.");
        if (!IsWellFormed(value))
            throw error($"{label} must contain valid Unicode text.");
        var builder = new StringBuilder(value.Length);
        var pendingSpace = false;
        foreach (var rune in value.Normalize(NormalizationForm.FormC).EnumerateRunes())
        {
            if (rune.Value is ' ' or '\t' || (Rune.IsWhiteSpace(rune) && Rune.GetUnicodeCategory(rune) == UnicodeCategory.SpaceSeparator))
            {
                pendingSpace = builder.Length > 0;
                continue;
            }
            if (!IsAllowedDisplayRune(rune))
                throw error($"{label} cannot contain control, line-break, invisible or text-direction characters.");
            if (pendingSpace)
                builder.Append(' ');
            pendingSpace = false;
            builder.Append(rune.ToString());
        }
        var normalized = builder.ToString();
        if (normalized.Length == 0 || normalized.Length > maxLength)
            throw error($"{label} must contain 1-{maxLength} characters.");
        return normalized;
    }

    public const int BioMaxLength = 500;

    /// <summary>
    /// The profile introduction: NFC, line breaks kept (CRLF becomes LF, at most one empty line in a row), tabs as
    /// spaces, trimmed. The same characters as display names are refused, so text cannot be hidden or reversed.
    /// Empty means "no introduction" (null).
    /// </summary>
    public static string? NormalizeBio(string? bio)
    {
        if (bio is null)
            return null;
        if (!IsWellFormed(bio))
            throw BioError("The introduction must contain valid Unicode text.");
        var builder = new StringBuilder(bio.Length);
        var newlines = 0;
        foreach (var rune in bio.Normalize(NormalizationForm.FormC).Replace("\r\n", "\n").Replace('\r', '\n').EnumerateRunes())
        {
            if (rune.Value == '\n')
            {
                newlines++;
                continue;
            }
            if (!IsAllowedDisplayRune(rune) && rune.Value != '\t')
                throw BioError("The introduction cannot contain control, invisible or text-direction characters.");
            if (newlines > 0 && builder.Length > 0)
                builder.Append(newlines > 1 ? "\n\n" : "\n");
            newlines = 0;
            builder.Append(rune.Value == '\t' ? " " : rune.ToString());
        }
        var normalized = string.Join('\n', builder.ToString().Split('\n').Select(line => line.Trim())).Trim();
        if (normalized.Length > BioMaxLength)
            throw BioError($"The introduction must be at most {BioMaxLength} characters.");
        return normalized.Length == 0 ? null : normalized;
    }

    private static ApiException BioError(string message) => new(400, "BIO_INVALID", message,
        new Dictionary<string, string[]> { ["bio"] = [message] });

    private static bool IsAllowedDisplayRune(Rune rune)
    {
        // The zero-width joiner builds emoji sequences (family, profession); it cannot reorder or hide text alone.
        if (rune.Value == 0x200D)
            return true;
        return Rune.GetUnicodeCategory(rune) switch
        {
            UnicodeCategory.Control or UnicodeCategory.Format or UnicodeCategory.LineSeparator
                or UnicodeCategory.ParagraphSeparator or UnicodeCategory.PrivateUse or UnicodeCategory.Surrogate => false,
            _ => true
        };
    }

    private static bool IsWellFormed(string value)
    {
        try
        {
            _ = new UTF8Encoding(false, true).GetByteCount(value);
            return true;
        }
        catch (EncoderFallbackException) { return false; }
    }

    private static ApiException UsernameError(string code, string message) =>
        new(400, code, message, new Dictionary<string, string[]> { ["username"] = [message] });

    private static ApiException DisplayNameError(string message) =>
        new(400, "DISPLAY_NAME_INVALID", message, new Dictionary<string, string[]> { ["displayName"] = [message] });

    [GeneratedRegex(@"\A[A-Za-z][A-Za-z0-9_]{1,30}[A-Za-z0-9]\z", RegexOptions.CultureInvariant)]
    private static partial Regex UsernamePattern();
}
