namespace Metrivum.Coaching.Domain;

/// <summary>Represents persisted specialization category state in Coaching; mapped and saved by the owning module's EF services.</summary>
public sealed class SpecializationCategory
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public int SortOrder { get; set; }
    public bool Active { get; set; } = true;
}
/// <summary>Represents persisted specialization state in Coaching; mapped and saved by the owning module's EF services.</summary>
public sealed class Specialization
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string CategoryCode { get; set; } = "";
    public int SortOrder { get; set; }
    public bool Active { get; set; } = true;
}
/// <summary>Represents persisted coach specialization profile state in Coaching; mapped and saved by the owning module's EF services.</summary>
public sealed class CoachSpecializationProfile
{
    public Guid CoachId { get; set; }
    public long Version { get; set; } = 1;
    public DateTimeOffset UpdatedAt { get; set; }
}
/// <summary>Represents persisted coach specialization state in Coaching; mapped and saved by the owning module's EF services.</summary>
public sealed class CoachSpecialization
{
    public Guid CoachId { get; set; }
    public string SpecializationCode { get; set; } = "";
    public bool IsPrimary { get; set; }
    public Specialization Specialization { get; set; } = null!;
}
/// <summary>Represents persisted coach specializations changed state in Coaching; mapped and saved by the owning module's EF services.</summary>
public sealed class CoachSpecializationsChanged
{
    public Guid CoachId { get; set; }
    public long Version { get; set; }
    public List<string> SelectedCodes { get; set; } = [];
    public List<string> PrimaryCodes { get; set; } = [];
    public DateTimeOffset ChangedAt { get; set; }
}

/// <summary>Defines the reviewed coach specialization taxonomy used by discovery; contains no persistence operations.</summary>
public static class CoachSpecializationTaxonomy
{
    public static IReadOnlyList<SpecializationCategory> Categories => [
        new() { Code = "strength_muscle", Name = "Strength & Muscle", SortOrder = 0 },
        new() { Code = "endurance_conditioning", Name = "Endurance & Conditioning", SortOrder = 1 },
        new() { Code = "athletic_performance", Name = "Athletic Performance", SortOrder = 2 },
        new() { Code = "general_fitness", Name = "General Fitness", SortOrder = 3 },
        new() { Code = "specialized_training", Name = "Specialized Training", SortOrder = 4 }
    ];
    public static IReadOnlyList<Specialization> Items => Groups.SelectMany((group, category) => group.Select((item, order) => new Specialization
        { Code = item.Code, Name = item.Name, CategoryCode = Categories[category].Code, SortOrder = order })).ToArray();
    private static readonly (string Code, string Name)[][] Groups = [
        [("strength_training", "Strength Training"), ("powerlifting", "Powerlifting"), ("olympic_weightlifting", "Olympic Weightlifting"), ("hypertrophy", "Hypertrophy"), ("bodybuilding", "Bodybuilding"), ("strongman", "Strongman"), ("calisthenics", "Calisthenics")],
        [("aerobic_conditioning", "Aerobic Conditioning"), ("anaerobic_conditioning", "Anaerobic Conditioning"), ("interval_training", "Interval Training / HIIT"), ("endurance_training", "Endurance Training"), ("hybrid_training", "Hybrid Training")],
        [("strength_conditioning", "Strength & Conditioning"), ("speed_agility", "Speed & Agility"), ("power_plyometrics", "Power & Plyometrics"), ("sport_specific_training", "Sport-Specific Training"), ("performance_testing", "Performance Testing")],
        [("general_fitness", "General Fitness"), ("functional_fitness", "Functional Fitness"), ("fat_loss_recomposition", "Fat Loss & Body Recomposition"), ("mobility_flexibility", "Mobility & Flexibility")],
        [("crossfit_functional_competition", "CrossFit / Functional Competition"), ("tactical_fitness", "Tactical Fitness"), ("return_to_sport", "Return to Sport"), ("senior_fitness", "Senior Fitness"), ("prenatal_postnatal_fitness", "Prenatal & Postnatal Fitness"), ("adaptive_fitness", "Adaptive Fitness")]
    ];
}
