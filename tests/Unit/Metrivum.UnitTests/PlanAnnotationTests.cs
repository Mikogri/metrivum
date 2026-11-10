using Metrivum.Training.Domain;

namespace Metrivum.UnitTests;

public sealed class PlanAnnotationTests
{
    [Fact]
    public void Private_annotations_never_enter_client_documents_and_scope_is_structural()
    {
        var cycle = new Cycle(Guid.NewGuid(), "Cycle", "", 7, []);
        var block = new Block(Guid.NewGuid(), "Block", "", [cycle]);
        var global = new PlanAnnotation(
            Guid.NewGuid(),
            AnnotationKind.Comment,
            "Global",
            "Shared",
            Visibility: AnnotationVisibility.Client
        );
        var secret = global with
        {
            Id = Guid.NewGuid(),
            Content = "PRIVATE",
            Visibility = AnnotationVisibility.Coach,
        };
        var goal = global with
        {
            Id = Guid.NewGuid(),
            Kind = AnnotationKind.Goal,
            TargetId = cycle.Id,
        };
        var document = new TrainingDocument(1, [block], Annotations: [global, secret, goal]);
        DocumentRules.Validate(document, new());
        Assert.DoesNotContain("PRIVATE", TrainingJson.Serialize(DocumentRules.ForClient(document)));
        Assert.Equal(3, DocumentRules.AnnotationsFor(document, block.Id, cycle.Id).Length);
        Assert.Equal(2, DocumentRules.AnnotationsFor(document, block.Id, Guid.NewGuid()).Length);
        var copy = DocumentRules.Copy(document);
        Assert.Equal(copy.Blocks[0].Cycles[0].Id, copy.Annotations![2].TargetId);
        Assert.NotEqual(goal.Id, copy.Annotations[2].Id);
        DocumentRules.Validate(copy, new());
        Assert.Throws<TrainingValidationException>(() =>
            DocumentRules.Validate(
                document with
                {
                    Annotations = [goal with { TargetId = Guid.NewGuid() }],
                },
                new()
            )
        );
        Assert.Throws<TrainingValidationException>(() =>
            DocumentRules.Validate(
                document with
                {
                    Annotations = [global with { Visibility = (AnnotationVisibility)999 }],
                },
                new()
            )
        );
        Assert.Throws<TrainingValidationException>(() =>
            DocumentRules.Validate(
                document with
                {
                    Annotations = [global with { Content = new string('x', 4001) }],
                },
                new()
            )
        );
    }
}
