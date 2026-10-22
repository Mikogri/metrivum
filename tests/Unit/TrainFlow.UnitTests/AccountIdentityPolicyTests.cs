using TrainFlow.Accounts.Domain;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.UnitTests;

public sealed class AccountIdentityPolicyTests
{
    [Theory]
    [InlineData("abc")]
    [InlineData("Coach_Anna")]
    [InlineData("anna_2026")]
    [InlineData("a1b2c3")]
    [InlineData("coach")]
    [InlineData("client")]
    [InlineData("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef")]
    public void Accepts_public_ascii_usernames(string username) => AccountIdentityPolicy.ValidateUsername(username);

    [Theory]
    [InlineData("", "USERNAME_INVALID")]
    [InlineData("ab", "USERNAME_INVALID")]
    [InlineData("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg", "USERNAME_INVALID")]
    [InlineData("1anna", "USERNAME_INVALID")]
    [InlineData("_anna", "USERNAME_INVALID")]
    [InlineData("anna_", "USERNAME_INVALID")]
    [InlineData("an__na", "USERNAME_INVALID")]
    [InlineData("anna.kowalska", "USERNAME_INVALID")]
    [InlineData("anna kowalska", "USERNAME_INVALID")]
    [InlineData(" anna", "USERNAME_INVALID")]
    [InlineData("anna\n", "USERNAME_INVALID")]
    [InlineData("ánna", "USERNAME_INVALID")]
    [InlineData("аnna", "USERNAME_INVALID")] // Cyrillic "а": a look-alike, not ASCII.
    [InlineData("anna​", "USERNAME_INVALID")]
    [InlineData("admin", "USERNAME_RESERVED")]
    [InlineData("ADMIN", "USERNAME_RESERVED")]
    [InlineData("Support", "USERNAME_RESERVED")]
    [InlineData("system", "USERNAME_RESERVED")]
    [InlineData("root", "USERNAME_RESERVED")]
    [InlineData("trainflow", "USERNAME_RESERVED")]
    [InlineData("TrainFlow_Team", "USERNAME_RESERVED")]
    [InlineData("trainflowcoach", "USERNAME_RESERVED")]
    public void Rejects_unsafe_or_reserved_usernames(string username, string code)
    {
        var error = Assert.Throws<ApiException>(() => AccountIdentityPolicy.ValidateUsername(username));
        Assert.Equal(400, error.Status);
        Assert.Equal(code, error.Code);
        Assert.True(error.Errors!.ContainsKey("username"));
    }

    [Fact]
    public void Username_message_is_plain_text() =>
        Assert.DoesNotContain("â", Assert.Throws<ApiException>(() => AccountIdentityPolicy.ValidateUsername("x")).Message);

    [Theory]
    [InlineData("Anna Kowalska", "Anna Kowalska")]
    [InlineData("  Anna   Kowalska  ", "Anna Kowalska")]
    [InlineData("Anna\tKowalska", "Anna Kowalska")]
    [InlineData("Łukasz Żółć", "Łukasz Żółć")]
    [InlineData("Мария", "Мария")]
    [InlineData("李小龍", "李小龍")]
    [InlineData("Coach 💪", "Coach 💪")]
    [InlineData("Family 👨‍👩‍👧", "Family 👨‍👩‍👧")] // ZWJ emoji sequence stays intact.
    [InlineData("O'Neil-Smith", "O'Neil-Smith")]
    public void Display_names_are_normalised(string input, string expected) =>
        Assert.Equal(expected, AccountIdentityPolicy.NormalizeDisplayName(input));

    [Fact]
    public void Display_names_use_composed_unicode() =>
        // "e" + combining acute accent becomes the single composed "é".
        Assert.Equal("René", AccountIdentityPolicy.NormalizeDisplayName("René"));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("Anna\0Kowalska")]
    [InlineData("Anna\u0007Kowalska")]
    [InlineData("Anna\u0085Kowalska")]
    [InlineData("Anna\nKowalska")]
    [InlineData("Anna‮akswolwoK")]
    [InlineData("Anna⁦Kowalska")]
    [InlineData("Anna​Kowalska")]
    [InlineData("Anna‎Kowalska")]
    [InlineData("Anna﻿Kowalska")]
    [InlineData("AnnaKowalska")]
    [InlineData("​​​")]
    public void Rejects_invisible_control_and_direction_characters(string input)
    {
        var error = Assert.Throws<ApiException>(() => AccountIdentityPolicy.NormalizeDisplayName(input));
        Assert.Equal("DISPLAY_NAME_INVALID", error.Code);
        Assert.True(error.Errors!.ContainsKey("displayName"));
    }

    [Theory]
    [InlineData(0x2028)] // Line separator (C# cannot hold it inside a literal).
    [InlineData(0x2029)] // Paragraph separator.
    public void Rejects_unicode_line_breaks(int codePoint) =>
        Assert.Throws<ApiException>(() => AccountIdentityPolicy.NormalizeDisplayName("Anna" + (char)codePoint + "Kowalska"));

    [Fact]
    public void Rejects_unpaired_surrogates() =>
        Assert.Throws<ApiException>(() => AccountIdentityPolicy.NormalizeDisplayName("Anna" + (char)0xD800));

    [Fact]
    public void Length_is_checked_after_normalisation()
    {
        Assert.Equal(new string('a', 100), AccountIdentityPolicy.NormalizeDisplayName("  " + new string('a', 100) + "  "));
        Assert.Throws<ApiException>(() => AccountIdentityPolicy.NormalizeDisplayName(new string('a', 101)));
    }
}
