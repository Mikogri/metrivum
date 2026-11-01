using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Domain;
using Metrivum.Coaching.Features;

namespace Metrivum.UnitTests;

public sealed class CoachSpecializationTests
{
    [Fact]
    public void Canonical_taxonomy_has_five_ordered_categories_and_27_unique_English_items()
    {
        Assert.Equal(new[] { "strength_muscle", "endurance_conditioning", "athletic_performance", "general_fitness", "specialized_training" }, CoachSpecializationTaxonomy.Categories.Select(x => x.Code));
        Assert.Equal(new[] { "Strength & Muscle", "Endurance & Conditioning", "Athletic Performance", "General Fitness", "Specialized Training" }, CoachSpecializationTaxonomy.Categories.Select(x => x.Name));
        Assert.Equal(27, CoachSpecializationTaxonomy.Items.Count);
        Assert.Equal(27, CoachSpecializationTaxonomy.Items.Select(x => x.Code).Distinct().Count());
        Assert.Equal(new[] { 7, 5, 5, 4, 6 }, CoachSpecializationTaxonomy.Categories.Select(c => CoachSpecializationTaxonomy.Items.Count(x => x.CategoryCode == c.Code)));
        Assert.Contains(CoachSpecializationTaxonomy.Items, x => x.Code == "interval_training" && x.Name == "Interval Training / HIIT");
        Assert.Contains(CoachSpecializationTaxonomy.Items, x => x.Code == "crossfit_functional_competition" && x.Name == "CrossFit / Functional Competition");
        Assert.Contains(CoachSpecializationTaxonomy.Items, x => x.Code == "prenatal_postnatal_fitness" && x.Name == "Prenatal & Postnatal Fitness");
        Assert.All(CoachSpecializationTaxonomy.Items, x => Assert.True(x.Active));
    }
    [Fact]
    public void Ten_selected_and_five_primary_or_empty_are_valid()
    {
        CoachSpecializationsService.Validate(new(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"], ["a", "b", "c", "d", "e"], 0));
        CoachSpecializationsService.Validate(new([], [], 0));
    }
    [Fact]
    public void Limits_duplicates_and_non_subset_primary_are_rejected()
    {
        foreach (var request in new CoachSpecializationsRequest[] {
            new(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"], [], 0), new(["a", "b", "c", "d", "e", "f"], ["a", "b", "c", "d", "e", "f"], 0),
            new(["a", "a"], [], 0), new(["a"], ["a", "a"], 0), new(["a"], ["b"], 0), new([""], [], 0), new([], [], -1) })
            Assert.Throws<ApiException>(() => CoachSpecializationsService.Validate(request));
    }
}
