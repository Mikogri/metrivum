using Metrivum.Accounts.Contracts;
using Metrivum.Forms.Contracts;

namespace Metrivum.Forms.Features;

/// <summary>
/// The application form every new coach starts with: a short draft with the basic questions, linked to the client's
/// profile fields where one exists, so a coach can publish it as is or adjust it first.
/// </summary>
public static class StarterForms
{
    public const string ApplicationName = "Starter application form";

    public static FormTemplateRequest Application() => new(FormPurpose.Application, ApplicationName,
        "Basic questions for new clients: goals, experience, availability and health. Edit anything before publishing.",
        new FormDefinition([
            new FormSection("goals", "Your goals", 0, [
                new FormQuestion("main_goal", "What is your main goal for the next 3 months?", QuestionType.LongText, Required: true, Order: 0, MaxLength: 2000),
                new FormQuestion("experience", "How much training experience do you have?", QuestionType.SingleChoice, Required: true, Order: 1,
                    Choices: [new("Beginner", "Beginner (under 1 year)"), new("Intermediate", "Intermediate (1–3 years)"), new("Advanced", "Advanced (over 3 years)")],
                    SystemField: SystemFieldKey.TrainingExperience),
            ]),
            new FormSection("availability", "Availability", 1, [
                new FormQuestion("sessions_per_week", "How many sessions a week can you train?", QuestionType.Number, Required: true, Order: 0, Min: 1, Max: 14,
                    SystemField: SystemFieldKey.SessionsPerWeek),
                new FormQuestion("session_length", "How long can one session be?", QuestionType.Number, Order: 1, Min: 10, Max: 300, Unit: "min",
                    SystemField: SystemFieldKey.AvailableSessionDuration),
                new FormQuestion("training_days", "Which days suit you best?", QuestionType.MultiChoice, Order: 2, MinSelections: 0, MaxSelections: 7,
                    Choices: [new("1", "Monday"), new("2", "Tuesday"), new("3", "Wednesday"), new("4", "Thursday"), new("5", "Friday"), new("6", "Saturday"), new("7", "Sunday")],
                    SystemField: SystemFieldKey.PreferredTrainingDays),
            ]),
            new FormSection("health", "Health", 2, [
                new FormQuestion("height", "Height", QuestionType.Number, Order: 0, Min: 100, Max: 250, Unit: "cm", SystemField: SystemFieldKey.Height),
                new FormQuestion("weight", "Weight", QuestionType.Number, Order: 1, Min: 30, Max: 300, Unit: "kg", SystemField: SystemFieldKey.Weight),
                new FormQuestion("injuries", "Any injuries, limitations or pain I should know about?", QuestionType.LongText, Order: 2, MaxLength: 4000,
                    SystemField: SystemFieldKey.InjuriesLimitationsPainNotes),
            ]),
            new FormSection("coaching", "Working together", 3, [
                new FormQuestion("check_in_style", "How often would you like to check in?", QuestionType.SingleChoice, Order: 0,
                    Choices: [new("weekly", "Every week"), new("biweekly", "Every two weeks"), new("monthly", "Once a month")]),
                new FormQuestion("anything_else", "Anything else you would like me to know?", QuestionType.LongText, Order: 1, MaxLength: 4000,
                    SystemField: SystemFieldKey.AdditionalNotes),
            ]),
        ]));
}
