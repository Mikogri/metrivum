using TrainFlow.Forms.Contracts;
using TrainFlow.Forms.Domain;
using TrainFlow.Forms.Features;

namespace TrainFlow.UnitTests;

public sealed class StarterFormsTests
{
    [Fact]
    public void The_starter_application_form_is_a_valid_application_form()
    {
        var starter = StarterForms.Application();
        Assert.Equal(FormPurpose.Application, starter.Purpose);
        FormRules.ValidateDefinition(starter.Purpose, starter.Name, starter.Description, starter.Draft);
        Assert.InRange(starter.Draft.Sections.Sum(section => section.Questions.Count), 8, 15);
        Assert.Contains(starter.Draft.Sections.SelectMany(section => section.Questions), question => question.Required);
    }
}
