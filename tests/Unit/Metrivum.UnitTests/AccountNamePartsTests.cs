using Metrivum.Accounts.Domain;
using Metrivum.BuildingBlocks;

namespace Metrivum.UnitTests;

public sealed class AccountNamePartsTests
{
    [Fact]
    public void First_and_last_name_build_the_display_name()
    {
        var name = AccountIdentityPolicy.ResolveName(null, "  Anna ", "Maria  Kowalska");
        Assert.Equal(("Anna Maria Kowalska", "Anna", "Maria Kowalska"), name);
    }

    [Fact]
    public void A_single_display_name_from_older_clients_is_split_at_the_first_space()
    {
        Assert.Equal(("Jan van der Berg", "Jan", "van der Berg"), AccountIdentityPolicy.ResolveName("Jan  van der Berg", null, null));
        Assert.Equal(("Madonna", "Madonna", null), AccountIdentityPolicy.ResolveName("Madonna", null, null));
    }

    [Theory]
    [InlineData("Anna", null, "lastName")]
    [InlineData(null, "Kowalska", "firstName")]
    [InlineData("Anna", "   ", "lastName")]
    [InlineData("Anna‮", "Kowalska", "firstName")]
    public void Both_parts_are_required_and_checked_like_the_display_name(string? first, string? last, string field)
    {
        var error = Assert.Throws<ApiException>(() => AccountIdentityPolicy.ResolveName("Ignored Name", first, last));
        Assert.Equal("NAME_INVALID", error.Code);
        Assert.True(error.Errors!.ContainsKey(field));
    }

    [Fact]
    public void A_part_longer_than_fifty_characters_is_refused()
    {
        var error = Assert.Throws<ApiException>(() => AccountIdentityPolicy.ResolveName(null, new string('a', 51), "Kowalska"));
        Assert.True(error.Errors!.ContainsKey("firstName"));
    }
}
