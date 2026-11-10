using System.Data.Common;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.ExerciseCatalog.Contracts;
using Metrivum.Notifications.Contracts;
using Metrivum.Training.Contracts;
using Metrivum.Training.Delivery;
using Metrivum.Training.Domain;
using Metrivum.Training.Features;
using Metrivum.Training.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Metrivum.IntegrationTests;

public sealed class TrainingDeliveryPostgresTests
{
    [TrainingPostgresFact]
    public async Task Maximum_effort_can_be_completed_with_a_saved_set_and_no_numerical_result()
    {
        foreach (var repetitions in new[] { true, false })
        {
            await using var f = new Fixture();
            var program = await f.Seed(
                repetitions ? SetKind.Amrap : SetKind.Standard,
                new(WorkTimeMax: repetitions ? null : true)
            );
            await f.Assign(program.Id);
            await using var client = f.Scope(f.Client);
            var occurrence = (
                await client.Service.ScheduleAsync(
                    new(2026, 1, 1),
                    new(2026, 1, 31),
                    null,
                    program.Id,
                    1,
                    100,
                    default
                )
            ).Items[0];
            var execution = await client.Service.StartAsync(occurrence.Id, default);
            Assert.Equal(
                400,
                (
                    await Assert.ThrowsAsync<ApiException>(() =>
                        client.Service.CompleteAsync(execution.Id, execution.Version, default)
                    )
                ).Status
            );
            var exercise = (
                await client.Service.WorkoutAsync(occurrence.Id, default)
            ).Prescription.Workout.Exercises.Single();
            var actual = new ActualSet(
                exercise.Sets[0].Id,
                null,
                false,
                null,
                null,
                null,
                LoadMeaning.TotalExternal,
                null,
                null,
                null,
                null,
                null,
                null,
                null
            );
            var saved = await client.Service.SaveAsync(
                execution.Id,
                new(
                    new(2026, 1, 1),
                    "",
                    null,
                    [new(exercise.Id, exercise.ExerciseId, null, [actual])]
                ),
                execution.Version,
                default
            );
            var completed = await client.Service.CompleteAsync(
                execution.Id,
                saved.Version,
                default
            );
            Assert.Equal(ExecutionStatus.Completed, completed.Status);
            var result = Assert.Single(Assert.Single(completed.Exercises).Sets);
            Assert.Null(result.Reps);
            Assert.Null(result.DurationSeconds);
        }
    }

    [TrainingPostgresFact]
    public async Task Analysis_picker_summaries_skip_set_reads_and_details_project_only_picker_columns()
    {
        await using var f = new Fixture();
        var program = await f.Seed();
        await f.Assign(program.Id);
        await using var client = f.Scope(f.Client);
        var schedule = await client.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 1, 31),
            null,
            program.Id,
            1,
            100,
            default
        );
        var execution = await client.Service.StartAsync(schedule.Items[0].Id, default);
        client.Db.Add(
            new ExerciseExecution
            {
                Id = Guid.NewGuid(),
                ExecutionId = execution.Id,
                ExerciseId = Guid.NewGuid(),
                Name = "Squat",
                Comment = new string('x', 1000),
                Sets =
                [
                    new SetExecution
                    {
                        Id = Guid.NewGuid(),
                        Reps = 5,
                        Load = 100,
                        LoadUnit = "kg",
                        Comment = new string('y', 1000),
                    },
                ],
            }
        );
        await client.Db.SaveChangesAsync();
        await using var coach = f.Scope(f.Coach);
        f.Queries.Commands.Clear();
        var summary = await coach.Service.AnalysisSetOptionsAsync(
            f.Relationship,
            60,
            default,
            includeSets: false
        );
        Assert.Equal(execution.Id, Assert.Single(summary.Workouts).ExecutionId);
        Assert.Empty(summary.Workouts[0].Exercises);
        Assert.DoesNotContain(
            f.Queries.Commands,
            sql => sql.Contains("exercise_executions", StringComparison.Ordinal)
        );
        Assert.DoesNotContain(
            f.Queries.Commands,
            sql => sql.Contains("set_executions", StringComparison.Ordinal)
        );
        f.Queries.Commands.Clear();
        var detail = await coach.Service.AnalysisSetOptionsAsync(
            f.Relationship,
            60,
            default,
            executionId: execution.Id
        );
        Assert.Single(Assert.Single(detail.Workouts).Exercises);
        Assert.All(f.Queries.Commands, sql => Assert.DoesNotContain("\"Comment\"", sql));
        var projected = Assert.Single(
            f.Queries.Commands,
            sql => sql.Contains("exercise_executions", StringComparison.Ordinal)
        );
        Assert.DoesNotContain("\"PrescribedInstanceId\"", projected);
        Assert.DoesNotContain("\"IsSubstitution\"", projected);
        Assert.DoesNotContain("\"LoadMeaning\"", projected);
    }

    [TrainingPostgresFact]
    public async Task Max_table_formulas_use_typed_athlete_inputs_and_preserve_staleness_and_scope()
    {
        await using var f = new Fixture { EnableClientFormulas = true };
        f.Clock.Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
        var seed = await f.Seed();
        await using var coach = f.Scope(f.Coach);
        var exercise = Guid.NewGuid();
        var alias = BlockMaxes.Alias(exercise, 1);
        var set = new TrainingSet(
            Guid.NewGuid(),
            SetKind.Standard,
            new(
                LoadFormula: new(
                    null,
                    1,
                    null,
                    [],
                    "oneRepMax_kg * .8",
                    new() { ["oneRepMax_kg"] = alias }
                ),
                LoadUnit: Unit.Lb
            )
        );
        var block = new Block(
            Guid.NewGuid(),
            "Block",
            "",
            [
                new(
                    Guid.NewGuid(),
                    "Cycle",
                    "",
                    7,
                    [
                        new(
                            Guid.NewGuid(),
                            1,
                            [
                                new(
                                    Guid.NewGuid(),
                                    "Workout",
                                    "",
                                    [new(Guid.NewGuid(), exercise, "", [set])],
                                    []
                                ),
                            ]
                        ),
                    ]
                ),
            ]
        );
        var row = new BlockExerciseMax(
            exercise,
            1,
            LoadFormula: new(
                null,
                1,
                null,
                [],
                "ROUND_TO_STEP_LOWER(oneRepMax_kg * .9, 2.5)",
                new() { ["oneRepMax_kg"] = alias }
            ),
            LoadUnit: Unit.Kg
        );
        var doc = new TrainingDocument(1, [block], [new(Guid.NewGuid(), block.Id, [row])]);
        var metric = await coach.Programs.SaveExerciseMaxAsync(
            f.Relationship,
            null,
            new(exercise, 1, new(100, Unit.Kg), new(2026, 1, 1), "bench"),
            null,
            default
        );
        var draft = await coach.Programs.SaveAsync(
            seed.Id,
            new("Typed max", "", null, doc),
            seed.Version,
            default
        );
        await coach.Programs.ApplyAsync(seed.Id, draft.Version, Guid.NewGuid().ToString(), default);
        var assignment = Assert.Single(
            (
                await coach.Service.AssignAsync(
                    seed.Id,
                    new(null, [f.Relationship], [], new(2026, 1, 1), "UTC"),
                    Guid.NewGuid().ToString(),
                    default
                )
            ).Assignments
        );
        var snapshot = await coach.Service.FormulaSnapshotAsync(assignment.Id, false, default);
        Assert.Equal(Unit.Lb, snapshot.Evaluations[set.Id].Result.Unit);
        Assert.Equal(72m / .45359237m, snapshot.Evaluations[set.Id].Result.Value);
        Assert.NotEmpty(snapshot.Evaluations[set.Id].SourceVersions!);
        await coach.Programs.SaveExerciseMaxAsync(
            f.Relationship,
            metric.Id,
            new(exercise, 1, new(110, Unit.Kg), new(2026, 1, 1), "bench"),
            metric.Version,
            default
        );
        Assert.True(
            (await coach.Service.FormulaSnapshotAsync(assignment.Id, false, default)).Stale
        );
        var empty = doc with
        {
            MaxesTables = [doc.MaxesTables![0] with { Rows = [new(exercise, 1)] }],
        };
        draft = await coach.Programs.SaveAsync(
            seed.Id,
            new("Incomplete", "", null, empty),
            draft.Version,
            default
        );
        await Assert.ThrowsAsync<Metrivum.BuildingBlocks.ApiException>(() =>
            coach.Programs.ApplyAsync(seed.Id, draft.Version, Guid.NewGuid().ToString(), default)
        );
    }

    [TrainingPostgresFact]
    public async Task Annotation_privacy_is_enforced_by_the_API_and_preserved_for_old_client_saves()
    {
        await using var f = new Fixture();
        f.Clock.Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
        var plan = await f.Seed();
        await using var coach = f.Scope(f.Coach);
        await using var client = f.Scope(f.Client);
        var content = plan.Draft with
        {
            Blocks = plan
                .Draft.Blocks.Select(b =>
                    b with
                    {
                        Cycles = b
                            .Cycles.Select(c =>
                                c with
                                {
                                    Days = c
                                        .Days.Select(d =>
                                            d with
                                            {
                                                Workouts = d
                                                    .Workouts.Select(w =>
                                                        w with
                                                        {
                                                            Exercises = w
                                                                .Exercises.Select(e =>
                                                                    e with
                                                                    {
                                                                        Sets = e
                                                                            .Sets.Select(set =>
                                                                                set with
                                                                                {
                                                                                    Id =
                                                                                        Guid.NewGuid(),
                                                                                }
                                                                            )
                                                                            .ToArray(),
                                                                    }
                                                                )
                                                                .ToArray(),
                                                        }
                                                    )
                                                    .ToArray(),
                                            }
                                        )
                                        .ToArray(),
                                }
                            )
                            .ToArray(),
                    }
                )
                .ToArray(),
        };
        var block = content.Blocks[0];
        var cycle = block.Cycles[0];
        var secret = new PlanAnnotation(
            Guid.NewGuid(),
            AnnotationKind.Comment,
            "Coach",
            "Private strategy"
        );
        var shared = new PlanAnnotation(
            Guid.NewGuid(),
            AnnotationKind.Goal,
            "Goal",
            "Build consistency",
            cycle.Id,
            AnnotationVisibility.Client
        );
        var other = shared with
        {
            Id = Guid.NewGuid(),
            TargetId = block.Cycles[1].Id,
            Content = "Other cycle",
        };
        var draft = await coach.Programs.SaveAsync(
            plan.Id,
            new("Notes", "", null, content with { Annotations = [secret, shared, other] }),
            plan.Version,
            default
        );
        draft = await coach.Programs.SaveAsync(
            plan.Id,
            new("Old client", "", null, draft.Document with { Annotations = null }),
            draft.Version,
            default
        );
        Assert.Equal(3, draft.Document.Annotations!.Length);
        await coach.Programs.ApplyAsync(plan.Id, draft.Version, Guid.NewGuid().ToString(), default);
        var assignment = Assert.Single(
            (
                await coach.Service.AssignAsync(
                    plan.Id,
                    new(null, [f.Relationship], [], new(2026, 1, 1), "UTC"),
                    Guid.NewGuid().ToString(),
                    default
                )
            ).Assignments
        );
        var occurrences = await coach
            .Db.Set<WorkoutOccurrence>()
            .AsNoTracking()
            .Where(o => o.AssignmentId == assignment.Id)
            .ToArrayAsync();
        var occurrence = occurrences.First(o => o.CycleId == cycle.Id);
        var coachDetail = await coach.Service.WorkoutAsync(occurrence.Id, default);
        var clientDetail = await client.Service.WorkoutAsync(occurrence.Id, default);
        Assert.Equal(2, coachDetail.Prescription.Annotations!.Length);
        Assert.Equal(shared.Id, Assert.Single(clientDetail.Prescription.Annotations!).Id);
        Assert.DoesNotContain("Private strategy", TrainingJson.Serialize(clientDetail));
        await client.Service.StartAsync(occurrence.Id, default);
        Assert.DoesNotContain(
            "Private strategy",
            TrainingJson.Serialize(await client.Service.WorkoutAsync(occurrence.Id, default))
        );
    }

    [TrainingPostgresFact]
    public async Task Independent_maxes_tables_survive_save_and_only_affect_explicitly_connected_blocks()
    {
        await using var f = new Fixture { EnableClientFormulas = true };
        f.Clock.Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
        var seed = await f.Seed();
        await using var coach = f.Scope(f.Coach);
        var exercise = Guid.NewGuid();
        var alias = BlockMaxes.Alias(exercise, 1);
        var set = new TrainingSet(
            Guid.NewGuid(),
            SetKind.Standard,
            new(
                LoadFormula: new(null, 1, null, [], "oneRepMax*.8", new() { ["oneRepMax"] = alias })
            )
        );
        var block = new Block(
            Guid.NewGuid(),
            "A",
            "",
            [
                new(
                    Guid.NewGuid(),
                    "Cycle",
                    "",
                    7,
                    [
                        new(
                            Guid.NewGuid(),
                            1,
                            [
                                new(
                                    Guid.NewGuid(),
                                    "Workout",
                                    "",
                                    [new(Guid.NewGuid(), exercise, "", [set])],
                                    []
                                ),
                            ]
                        ),
                    ]
                ),
            ]
        );
        var table = new ExerciseMaxesTable(
            Guid.NewGuid(),
            null,
            [new(exercise, 1, new(150, Unit.Kg))]
        );
        var document = new TrainingDocument(1, [block], [table]);
        await coach.Programs.SaveExerciseMaxAsync(
            f.Relationship,
            null,
            new(exercise, 1, new(100, Unit.Kg), new(2026, 1, 1), "benchSingle"),
            null,
            default
        );
        var draft = await coach.Programs.SaveAsync(
            seed.Id,
            new("Detached", "", null, document),
            seed.Version,
            default
        );
        Assert.Null(Assert.Single(draft.Document.MaxesTables!).BlockId);
        await coach.Programs.ApplyAsync(seed.Id, draft.Version, Guid.NewGuid().ToString(), default);
        var assignment = Assert.Single(
            (
                await coach.Service.AssignAsync(
                    seed.Id,
                    new(null, [f.Relationship], [], new(2026, 1, 1), "UTC"),
                    Guid.NewGuid().ToString(),
                    default
                )
            ).Assignments
        );
        Assert.Equal(
            80,
            (await coach.Service.FormulaSnapshotAsync(assignment.Id, false, default))
                .Evaluations[set.Id]
                .Result
                .Value
        );
        document = document with { MaxesTables = [table with { BlockId = block.Id }] };
        draft = await coach.Programs.SaveAsync(
            seed.Id,
            new("Connected", "", null, document),
            draft.Version,
            default
        );
        await coach.Programs.ApplyAsync(seed.Id, draft.Version, Guid.NewGuid().ToString(), default);
        Assert.Equal(
            120,
            (await coach.Service.FormulaSnapshotAsync(assignment.Id, false, default))
                .Evaluations[set.Id]
                .Result
                .Value
        );
        draft = await coach.Programs.SaveAsync(
            seed.Id,
            new("Old client", "", null, document with { MaxesTables = null }),
            draft.Version,
            default
        );
        Assert.Equal(table.Id, Assert.Single(draft.Document.MaxesTables!).Id);
        draft = await coach.Programs.SaveAsync(
            seed.Id,
            new("Detached again", "", null, document with { MaxesTables = [table] }),
            draft.Version,
            default
        );
        await coach.Programs.ApplyAsync(seed.Id, draft.Version, Guid.NewGuid().ToString(), default);
        Assert.Equal(
            80,
            (await coach.Service.FormulaSnapshotAsync(assignment.Id, false, default))
                .Evaluations[set.Id]
                .Result
                .Value
        );
    }

    [TrainingPostgresFact]
    public async Task Block_maxes_override_only_their_block_and_survive_old_client_saves()
    {
        await using var f = new Fixture { EnableClientFormulas = true };
        f.Clock.Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
        var seed = await f.Seed();
        await using var coach = f.Scope(f.Coach);
        var exercise = Guid.NewGuid();
        var alias = BlockMaxes.Alias(exercise, 1);
        TrainingSet S() =>
            new(
                Guid.NewGuid(),
                SetKind.Standard,
                new(
                    LoadFormula: new(
                        null,
                        1,
                        null,
                        [],
                        "oneRepMax*.8",
                        new() { ["oneRepMax"] = alias }
                    )
                )
            );
        var setA = S();
        var setB = S();
        var repSet = new TrainingSet(
            Guid.NewGuid(),
            SetKind.Standard,
            new(LoadFormula: new(null, 1, null, [], "repMax*.8", new() { ["repMax"] = alias }))
        );
        Block B(
            string name,
            TrainingSet set,
            BlockExerciseMax[]? rows = null,
            TrainingSet? extra = null
        ) =>
            new(
                Guid.NewGuid(),
                name,
                "",
                [
                    new(
                        Guid.NewGuid(),
                        "Cycle",
                        "",
                        7,
                        [
                            new(
                                Guid.NewGuid(),
                                1,
                                [
                                    new(
                                        Guid.NewGuid(),
                                        "Workout",
                                        "",
                                        [
                                            new(
                                                Guid.NewGuid(),
                                                exercise,
                                                "",
                                                extra == null ? [set] : [set, extra]
                                            ),
                                        ],
                                        []
                                    ),
                                ]
                            ),
                        ]
                    ),
                ],
                rows
            );
        var document = new TrainingDocument(
            1,
            [B("A", setA, [new(exercise, 1, new(150, Unit.Kg))], repSet), B("B", setB)]
        );
        await coach.Programs.SaveExerciseMaxAsync(
            f.Relationship,
            null,
            new(exercise, 1, new(100, Unit.Kg), new(2026, 1, 1), "benchSingle"),
            null,
            default
        );
        var draft = await coach.Programs.SaveAsync(
            seed.Id,
            new("Scoped", "", null, document),
            seed.Version,
            default
        );
        var revision = await coach.Programs.ApplyAsync(
            seed.Id,
            draft.Version,
            Guid.NewGuid().ToString(),
            default
        );
        var assignment = Assert.Single(
            (
                await coach.Service.AssignAsync(
                    seed.Id,
                    new(null, [f.Relationship], [], new(2026, 1, 1), "UTC"),
                    Guid.NewGuid().ToString(),
                    default
                )
            ).Assignments
        );
        var values = await coach.Service.FormulaSnapshotAsync(assignment.Id, false, default);
        Assert.Equal(120, values.Evaluations[setA.Id].Result.Value);
        Assert.Equal(80, values.Evaluations[setB.Id].Result.Value);
        Assert.Empty(values.Evaluations[setA.Id].SourceVersions!);
        Assert.NotEmpty(values.Evaluations[setB.Id].SourceVersions!);
        Assert.Equal(100, values.Variables[alias].Value);
        // The generic row variable follows the block's rep count; 1RM never becomes a five-rep max.
        document = document with
        {
            Blocks = document
                .Blocks.Select(
                    (b, i) =>
                        i == 0 ? b with { ExerciseMaxes = [new(exercise, 5, new(80, Unit.Kg))] } : b
                )
                .ToArray(),
        };
        draft = await coach.Programs.SaveAsync(
            seed.Id,
            new("Five reps", "", null, document),
            draft.Version,
            default
        );
        await coach.Programs.ApplyAsync(seed.Id, draft.Version, Guid.NewGuid().ToString(), default);
        values = await coach.Service.FormulaSnapshotAsync(assignment.Id, false, default);
        Assert.Equal(64, values.Evaluations[repSet.Id].Result.Value);
        Assert.Equal(80, values.Evaluations[setA.Id].Result.Value);
        Assert.Equal(80, values.Evaluations[setB.Id].Result.Value);
        var oldClient = document with
        {
            Blocks = document.Blocks.Select(b => b with { ExerciseMaxes = null }).ToArray(),
        };
        draft = await coach.Programs.SaveAsync(
            seed.Id,
            new("Old client", "", null, oldClient),
            draft.Version,
            default
        );
        Assert.Equal(80, draft.Document.Blocks[0].ExerciseMaxes![0].Load!.Value);
        var clear = draft.Document with
        {
            Blocks = draft.Document.Blocks.Select(b => b with { ExerciseMaxes = [] }).ToArray(),
        };
        draft = await coach.Programs.SaveAsync(
            seed.Id,
            new("Clear", "", null, clear),
            draft.Version,
            default
        );
        Assert.Empty(draft.Document.Blocks[0].ExerciseMaxes!);
        Assert.Equal(
            150,
            (await coach.Programs.RevisionAsync(seed.Id, revision.Number, default))
                .Snapshot
                .Document
                .Blocks[0]
                .ExerciseMaxes![0]
                .Load!
                .Value
        );
    }

    [TrainingPostgresFact]
    public async Task Exercise_scoped_one_rep_max_uses_latest_measured_single_and_ignores_multi_rep_results()
    {
        await using var f = new Fixture { EnableClientFormulas = true };
        f.Clock.Now = new(2026, 1, 3, 12, 0, 0, TimeSpan.Zero);
        await f.Seed();
        await using var coach = f.Scope(f.Coach);
        var exercise = Guid.NewGuid();
        var other = Guid.NewGuid();
        await coach.Programs.SaveExerciseMaxAsync(
            f.Relationship,
            null,
            new(exercise, 1, new(100, Unit.Kg), new(2026, 1, 1), "oldSingle"),
            null,
            default
        );
        await coach.Programs.SaveExerciseMaxAsync(
            f.Relationship,
            null,
            new(exercise, 1, new(110, Unit.Kg), new(2026, 1, 2), "newSingle"),
            null,
            default
        );
        await coach.Programs.SaveExerciseMaxAsync(
            f.Relationship,
            null,
            new(exercise, 5, new(120, Unit.Kg), new(2026, 1, 3), "fiveReps"),
            null,
            default
        );
        await coach.Programs.SaveExerciseMaxAsync(
            f.Relationship,
            null,
            new(other, 5, new(80, Unit.Kg), new(2026, 1, 3), "otherFive"),
            null,
            default
        );
        var values = await coach.Programs.ClientVariablesAsync(f.Relationship, default);
        var alias = $"exercise1Rm_{exercise:N}";
        Assert.Equal(110, values.Variables[alias].Value);
        Assert.Equal(values.SourceVersions["newSingle"], values.SourceVersions[alias]);
        Assert.False(values.Variables.ContainsKey($"exercise1Rm_{other:N}"));
        var formula = new FormulaUse(
            null,
            1,
            null,
            [],
            "oneRepMax*80%",
            new() { ["oneRepMax"] = alias }
        );
        Assert.Equal(
            88,
            FormulaBindings
                .Evaluate(formula, null, values.Variables, values.SourceVersions)
                .Result.Value
        );
    }

    [TrainingPostgresFact]
    public async Task Applying_new_client_alias_supplements_snapshot_without_refreshing_existing_values()
    {
        await using var f = new Fixture { EnableClientFormulas = true };
        f.Clock.Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
        var seed = await f.Seed();
        await using var coach = f.Scope(f.Coach);
        var benchExercise = Guid.NewGuid();
        var squatExercise = Guid.NewGuid();
        TrainingSet S(string alias) =>
            new(
                Guid.NewGuid(),
                SetKind.Standard,
                new(LoadFormula: new(null, 1, null, [], $"={alias}*80%"))
            );
        var bench = S("maxBench1r");
        var squat = S("maxSquat1r");
        var workout = new Workout(
            Guid.NewGuid(),
            "Formula session",
            "",
            [new(Guid.NewGuid(), benchExercise, "", [bench])],
            []
        );
        TrainingDocument D(Workout w) =>
            new(
                1,
                [
                    new(
                        Guid.NewGuid(),
                        "Block",
                        "",
                        [new(Guid.NewGuid(), "Cycle", "", 7, [new(Guid.NewGuid(), 1, [w])])]
                    ),
                ]
            );
        var benchMetric = await coach.Programs.SaveExerciseMaxAsync(
            f.Relationship,
            null,
            new(benchExercise, 1, new(100, Unit.Kg), new(2026, 1, 1), "maxBench1r"),
            null,
            default
        );
        var draft = await coach.Programs.SaveAsync(
            seed.Id,
            new("Bound", "", null, D(workout)),
            1,
            default
        );
        await coach.Programs.ApplyAsync(seed.Id, draft.Version, Guid.NewGuid().ToString(), default);
        var assignment = Assert.Single(
            (
                await coach.Service.AssignAsync(
                    seed.Id,
                    new(null, [f.Relationship], [], new(2026, 1, 1), "Europe/Warsaw"),
                    Guid.NewGuid().ToString(),
                    default
                )
            ).Assignments
        );
        var original = await coach.Service.FormulaSnapshotAsync(assignment.Id, false, default);
        await coach.Programs.SaveExerciseMaxAsync(
            f.Relationship,
            null,
            new(squatExercise, 1, new(150, Unit.Kg), new(2026, 1, 1), "maxSquat1r"),
            null,
            default
        );
        await coach.Programs.SaveExerciseMaxAsync(
            f.Relationship,
            benchMetric.Id,
            new(benchExercise, 1, new(120, Unit.Kg), new(2026, 1, 1), "maxBench1r"),
            benchMetric.Version,
            default
        );
        var expanded = workout with
        {
            Exercises = [.. workout.Exercises, new(Guid.NewGuid(), squatExercise, "", [squat])],
        };
        draft = await coach.Programs.SaveAsync(
            seed.Id,
            new("Expanded", "", null, D(expanded)),
            draft.Version,
            default
        );
        var applied = await coach.Programs.ApplyAsync(
            seed.Id,
            draft.Version,
            Guid.NewGuid().ToString(),
            default
        );
        var snapshot = await coach.Service.FormulaSnapshotAsync(assignment.Id, false, default);
        Assert.Equal(80, snapshot.Evaluations[bench.Id].Result.Value);
        Assert.Equal(120, snapshot.Evaluations[squat.Id].Result.Value);
        Assert.Equal(original.SourceVersions["maxBench1r"], snapshot.SourceVersions["maxBench1r"]);
        Assert.Equal(150, snapshot.Variables["maxSquat1r"].Value);
        Assert.True(snapshot.Stale);
        var missing = expanded with
        {
            Exercises =
            [
                .. expanded.Exercises,
                new(Guid.NewGuid(), squatExercise, "", [S("missingMax")]),
            ],
        };
        draft = await coach.Programs.SaveAsync(
            seed.Id,
            new("Missing", "", null, D(missing)),
            draft.Version,
            default
        );
        Assert.Equal(
            400,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Programs.ApplyAsync(
                        seed.Id,
                        draft.Version,
                        Guid.NewGuid().ToString(),
                        default
                    )
                )
            ).Status
        );
        await using var verify = f.Scope(f.Coach);
        Assert.Equal(
            applied.Id,
            (await verify.Service.GetAsync(assignment.Id, default)).EffectiveRevisionId
        );
        Assert.Equal(3, await verify.Db.Revisions.CountAsync(x => x.PlanId == seed.Id));
        var persisted = await verify.Service.FormulaSnapshotAsync(assignment.Id, false, default);
        Assert.Equal(80, persisted.Evaluations[bench.Id].Result.Value);
        Assert.Equal(120, persisted.Evaluations[squat.Id].Result.Value);
    }

    [TrainingPostgresFact]
    public async Task Client_profile_variables_use_private_contract_without_zero_defaults_or_unrelated_staleness()
    {
        await using var f = new Fixture { EnableClientFormulas = true };
        await using var coach = f.Scope(f.Coach);
        Assert.Empty(
            (await coach.Programs.ClientVariablesAsync(f.Relationship, default)).Variables
        );
        f.Profiles.Values[SystemFieldKey.Weight] =
            System.Text.Json.JsonSerializer.SerializeToElement(80m);
        f.Profiles.Values[SystemFieldKey.Height] =
            System.Text.Json.JsonSerializer.SerializeToElement(180m);
        f.Profiles.Values[SystemFieldKey.HrMax] =
            System.Text.Json.JsonSerializer.SerializeToElement(190m);
        var values = await coach.Programs.ClientVariablesAsync(f.Relationship, default);
        Assert.Equal(new Quantity(80, Unit.Kg), values.Variables["bodyweight"]);
        Assert.Equal(new Quantity(180, Unit.Scalar), values.Variables["height"]);
        Assert.Equal(190, values.Variables["hrMax"].Value);
        f.Profiles.Version++;
        var unrelated = await coach.Programs.ClientVariablesAsync(f.Relationship, default);
        Assert.Equal(values.SourceVersions["weight"], unrelated.SourceVersions["weight"]);
        f.Profiles.Values[SystemFieldKey.Weight] =
            System.Text.Json.JsonSerializer.SerializeToElement(81m);
        Assert.NotEqual(
            values.SourceVersions["weight"],
            (await coach.Programs.ClientVariablesAsync(f.Relationship, default)).SourceVersions[
                "weight"
            ]
        );
    }

    [TrainingPostgresFact]
    public async Task Client_formula_metrics_freeze_until_explicit_refresh_and_preserve_started_workouts()
    {
        await using var f = new Fixture { EnableClientFormulas = true };
        f.Clock.Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
        var seed = await f.Seed();
        await using var coach = f.Scope(f.Coach);
        var exercise = Guid.NewGuid();
        Workout W() =>
            new(
                Guid.NewGuid(),
                "Formula session",
                "",
                [
                    new(
                        Guid.NewGuid(),
                        exercise,
                        "",
                        [
                            new(
                                Guid.NewGuid(),
                                SetKind.Standard,
                                new(LoadFormula: new(null, 1, null, [], "=maxBench1r*80%"))
                            ),
                        ]
                    ),
                ],
                []
            );
        var doc = new TrainingDocument(
            1,
            [
                new(
                    Guid.NewGuid(),
                    "Block",
                    "",
                    [
                        new(
                            Guid.NewGuid(),
                            "Cycle",
                            "",
                            14,
                            [new(Guid.NewGuid(), 1, [W()]), new(Guid.NewGuid(), 8, [W()])]
                        ),
                    ]
                ),
            ]
        );
        var metric = await coach.Programs.SaveExerciseMaxAsync(
            f.Relationship,
            null,
            new(exercise, 1, new(100, Unit.Kg), new(2026, 1, 1), "maxBench1r"),
            null,
            default
        );
        var draft = await coach.Programs.SaveAsync(
            seed.Id,
            new("Formula", "", null, doc),
            1,
            default
        );
        await coach.Programs.ApplyAsync(seed.Id, draft.Version, Guid.NewGuid().ToString(), default);
        var assignment = Assert.Single(
            (
                await coach.Service.AssignAsync(
                    seed.Id,
                    new(null, [f.Relationship], [], new(2026, 1, 1), "Europe/Warsaw"),
                    Guid.NewGuid().ToString(),
                    default
                )
            ).Assignments
        );
        var initial = await coach.Service.FormulaSnapshotAsync(assignment.Id, false, default);
        Assert.All(initial.Evaluations.Values, x => Assert.Equal(80, x.Result.Value));
        Assert.False(initial.Stale);
        var schedule = await coach.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 1, 31),
            f.Relationship,
            seed.Id,
            1,
            25,
            default
        );
        await using (var client = f.Scope(f.Client))
        {
            await client.Service.StartAsync(schedule.Items[0].Id, default);
        }
        await coach.Programs.SaveExerciseMaxAsync(
            f.Relationship,
            metric.Id,
            new(exercise, 1, new(120, Unit.Kg), new(2026, 1, 1), "maxBench1r"),
            metric.Version,
            default
        );
        Assert.True(
            (await coach.Service.FormulaSnapshotAsync(assignment.Id, false, default)).Stale
        );
        Assert.All(
            (await coach.Service.FormulaSnapshotAsync(assignment.Id, false, default))
                .Evaluations
                .Values,
            x => Assert.Equal(80, x.Result.Value)
        );
        var saved = await coach.Programs.SaveAsync(
            seed.Id,
            new("Formula updated", "", null, doc),
            draft.Version,
            default
        );
        await coach.Programs.ApplyAsync(seed.Id, saved.Version, Guid.NewGuid().ToString(), default);
        var afterApply = await coach.Service.FormulaSnapshotAsync(assignment.Id, false, default);
        Assert.True(afterApply.Stale);
        Assert.All(afterApply.Evaluations.Values, x => Assert.Equal(80, x.Result.Value));
        var preview = await coach.Service.FormulaSnapshotAsync(assignment.Id, true, default);
        var latest = await coach.Service.GetAsync(assignment.Id, default);
        var wrongPreview = new RefreshFormulaSnapshotRequest(initial.SourceVersions);
        Assert.Equal(
            409,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Service.RefreshFormulaSnapshotAsync(
                        assignment.Id,
                        wrongPreview,
                        latest.Version,
                        default
                    )
                )
            ).Status
        );
        var refreshed = await coach.Service.RefreshFormulaSnapshotAsync(
            assignment.Id,
            new(preview.SourceVersions),
            latest.Version,
            default
        );
        Assert.False(refreshed.Stale);
        Assert.All(refreshed.Evaluations.Values, x => Assert.Equal(96, x.Result.Value));
        var started = await coach.Service.WorkoutAsync(schedule.Items[0].Id, default);
        Assert.All(started.Prescription.Formulas.Values, x => Assert.Equal(80, x.Result.Value));
        var future = await coach.Service.ScheduleAsync(
            new(2026, 1, 8),
            new(2026, 1, 8),
            f.Relationship,
            seed.Id,
            1,
            25,
            default
        );
        Assert.All(
            (await coach.Service.WorkoutAsync(Assert.Single(future.Items).Id, default))
                .Prescription
                .Formulas
                .Values,
            x => Assert.Equal(96, x.Result.Value)
        );
        Assert.Equal(
            409,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Service.RefreshFormulaSnapshotAsync(
                        assignment.Id,
                        new(preview.SourceVersions),
                        latest.Version,
                        default
                    )
                )
            ).Status
        );
    }

    [TrainingPostgresFact]
    public async Task Client_formula_metrics_require_manage_access_and_missing_client_variable_rolls_back_assignment()
    {
        await using var f = new Fixture { EnableClientFormulas = true };
        var seed = await f.Seed();
        await using var coach = f.Scope(f.Coach);
        var exercise = Guid.NewGuid();
        var metric = await coach.Programs.SaveExerciseMaxAsync(
            f.Relationship,
            null,
            new(exercise, 1, new(100, Unit.Kg), new(2026, 1, 1), "maxBench1r"),
            null,
            default
        );
        var otherRelationship = f.Directory.GroupMembers[1];
        Assert.Empty(
            (await coach.Programs.ClientVariablesAsync(otherRelationship, default)).Variables
        );
        await using (var client = f.Scope(f.Client))
            Assert.Equal(
                403,
                (
                    await Assert.ThrowsAsync<ApiException>(() =>
                        client.Programs.ClientVariablesAsync(f.Relationship, default)
                    )
                ).Status
            );
        f.Directory.DeniedOperations.Add(RelationshipOperation.Manage);
        Assert.Equal(
            403,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Programs.ClientVariablesAsync(f.Relationship, default)
                )
            ).Status
        );
        f.Directory.DeniedOperations.Clear();
        f.Directory.Status = RelationshipStatus.Suspended;
        Assert.Equal(
            403,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Programs.ClientVariablesAsync(f.Relationship, default)
                )
            ).Status
        );
        f.Directory.Status = RelationshipStatus.Active;
        Assert.Equal(
            412,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Programs.SaveExerciseMaxAsync(
                        f.Relationship,
                        metric.Id,
                        new(exercise, 1, new(110, Unit.Kg), new(2026, 1, 1), "maxBench1r"),
                        999,
                        default
                    )
                )
            ).Status
        );
        var workout = new Workout(
            Guid.NewGuid(),
            "Missing metric",
            "",
            [
                new(
                    Guid.NewGuid(),
                    exercise,
                    "",
                    [
                        new(
                            Guid.NewGuid(),
                            SetKind.Standard,
                            new(LoadFormula: new(null, 1, null, [], "=maxBench1r*80%"))
                        ),
                    ]
                ),
            ],
            []
        );
        var doc = new TrainingDocument(
            1,
            [
                new(
                    Guid.NewGuid(),
                    "Block",
                    "",
                    [new(Guid.NewGuid(), "Cycle", "", 7, [new(Guid.NewGuid(), 1, [workout])])]
                ),
            ]
        );
        var draft = await coach.Programs.SaveAsync(
            seed.Id,
            new("Bound", "", null, doc),
            1,
            default
        );
        await coach.Programs.ApplyAsync(seed.Id, draft.Version, Guid.NewGuid().ToString(), default);
        Assert.Equal(
            400,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Service.AssignAsync(
                        seed.Id,
                        new(
                            null,
                            [f.Relationship, otherRelationship],
                            [],
                            new(2026, 1, 1),
                            "Europe/Warsaw"
                        ),
                        Guid.NewGuid().ToString(),
                        default
                    )
                )
            ).Status
        );
        await using var verify = f.Scope(f.Coach);
        Assert.False(
            await verify.Db.Set<ProgramAssignment>().AnyAsync(x => x.ProgramId == seed.Id)
        );
    }

    [TrainingPostgresFact]
    public async Task Mcp_actual_logs_are_batched_authorized_and_keep_units_and_effective_prescriptions()
    {
        await using var f = new Fixture();
        var program = await f.Seed();
        var assignment = await f.Assign(program.Id);
        await using (var client = f.Scope(f.Client))
        {
            var schedule = await client.Service.ScheduleAsync(
                new(2026, 1, 1),
                new(2026, 1, 31),
                f.Relationship,
                program.Id,
                1,
                25,
                default
            );
            foreach (var occurrence in schedule.Items)
            {
                var started = await client.Service.StartAsync(occurrence.Id, default);
                var actual = await client.Service.SaveAsync(
                    started.Id,
                    new(
                        occurrence.ScheduledDate,
                        "Recorded session",
                        1200,
                        [
                            new(
                                null,
                                Guid.NewGuid(),
                                "Actual cue",
                                [
                                    new(
                                        null,
                                        null,
                                        false,
                                        5,
                                        20,
                                        "kg",
                                        LoadMeaning.TotalExternal,
                                        8,
                                        null,
                                        null,
                                        null,
                                        90,
                                        "2-0-1-0",
                                        "Actual set"
                                    ),
                                ]
                            ),
                        ]
                    ),
                    started.Version,
                    default
                );
                await client.Service.CompleteAsync(actual.Id, actual.Version, default);
            }
        }
        await using var coach = f.Scope(f.Coach);
        var adapter = new McpTrainingOperations(
            coach.Programs,
            coach.Service,
            new Account(f.Coach, f.Coach)
        );
        f.Queries.Commands.Clear();
        var first = await adapter.LogsAsync(
            f.Relationship,
            new(2026, 1, 1),
            new(2026, 1, 31),
            1,
            1,
            default
        );
        var oneQueryCount = f.Queries.Commands.Count;
        Assert.Equal(2, first.Total);
        Assert.Single(first.Items);
        f.Queries.Commands.Clear();
        var full = await adapter.LogsAsync(
            f.Relationship,
            new(2026, 1, 1),
            new(2026, 1, 31),
            1,
            25,
            default
        );
        Assert.Equal(2, full.Items.Length);
        Assert.True(
            f.Queries.Commands.Count <= oneQueryCount + 1,
            "Execution queries must stay bounded when the occurrence page grows."
        );
        var set = Assert.Single(Assert.Single(full.Items[0].Exercises).Sets);
        Assert.Equal("kg", set.LoadUnit);
        Assert.Equal("TotalExternal", set.LoadMeaning);
        Assert.Equal(20m, set.Load);
        Assert.Equal(8m, set.Rpe);
        Assert.Equal(90m, set.RestSeconds);
        Assert.Equal("2-0-1-0", set.Tempo);
        Assert.Equal("Actual set", set.Comment);
        Assert.NotNull(full.Items[0].CompletedAt);
        Assert.Equal(
            404,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    adapter.LogsAsync(
                        Guid.NewGuid(),
                        new(2026, 1, 1),
                        new(2026, 1, 31),
                        1,
                        25,
                        default
                    )
                )
            ).Status
        );
        Assert.Empty(
            (
                await adapter.LogsAsync(
                    f.Relationship,
                    new(2027, 1, 1),
                    new(2027, 1, 31),
                    1,
                    25,
                    default
                )
            ).Items
        );
        var draft = await adapter.GetAsync(program.Id, default);
        await adapter.ApplyDraftAsync(
            program.Id,
            draft.Revision,
            new(draft.Name, "Private edited notes", draft.FolderId, new(1, [])),
            default
        );
        Assert.Equal(
            assignment.EffectiveRevisionId,
            (await coach.Service.GetAsync(assignment.Id, default)).EffectiveRevisionId
        );
        Assert.Equal(1, await coach.Db.Revisions.CountAsync(x => x.PlanId == program.Id));
        Assert.Equal(
            full.Items.Select(x => x.OccurrenceId),
            (
                await adapter.LogsAsync(
                    f.Relationship,
                    new(2026, 1, 1),
                    new(2026, 1, 31),
                    1,
                    25,
                    default
                )
            ).Items.Select(x => x.OccurrenceId)
        );
    }

    [TrainingPostgresFact]
    public async Task Progress_reports_partial_client_details_without_truncating_totals()
    {
        await using var f = new Fixture();
        var program = await f.Seed();
        f.Directory.GroupMembers.Clear();
        f.Directory.GroupMembers.AddRange(Enumerable.Range(0, 201).Select(_ => Guid.NewGuid()));
        await using var scope = f.Scope(f.Coach);
        foreach (var recipients in f.Directory.GroupMembers.Chunk(200))
            await scope.Service.AssignAsync(
                program.Id,
                new(null, recipients, [], new(2026, 1, 1), "Europe/Warsaw"),
                Guid.NewGuid().ToString(),
                default
            );
        var report = await scope.Service.ReadAsync(new(new(2026, 1, 1), new(2026, 1, 31)), default);
        Assert.Equal(402, report.Planned);
        Assert.Equal(200, report.Clients.Length);
        Assert.True(report.ClientsHasMore);
        Assert.False(report.PerformanceHasMore);
        var narrowed = await scope.Service.ReadAsync(
            new(new(2026, 1, 1), new(2026, 1, 31), report.Clients[0].RelationshipId),
            default
        );
        Assert.Single(narrowed.Clients);
        Assert.False(narrowed.ClientsHasMore);
        Assert.Equal(2, narrowed.Planned);
    }

    [TrainingPostgresFact]
    public async Task Activity_filters_paginate_in_sql_and_preserve_due_denominator()
    {
        await using var f = new Fixture();
        f.Clock.Now = new(2026, 1, 5, 12, 0, 0, TimeSpan.Zero);
        var program = await f.Seed();
        await f.Assign(program.Id);
        await using var scope = f.Scope(f.Client);
        var all = await scope.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 1, 31),
            f.Relationship,
            program.Id,
            1,
            100,
            default
        );
        var started = await scope.Service.StartAsync(all.Items[0].Id, default);
        var exerciseId = Guid.NewGuid();
        var saved = await scope.Service.SaveAsync(
            started.Id,
            new(
                new(2026, 1, 2),
                "Recorded session",
                1800,
                [
                    new(
                        null,
                        exerciseId,
                        "",
                        [
                            new(
                                null,
                                null,
                                false,
                                5,
                                20,
                                "kg",
                                LoadMeaning.TotalExternal,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null
                            ),
                        ]
                    ),
                ]
            ),
            started.Version,
            default
        );
        await scope.Service.CompleteAsync(saved.Id, saved.Version, default);
        var completed = await scope.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 1, 31),
            f.Relationship,
            program.Id,
            1,
            1,
            default,
            status: "Completed",
            sort: "latest"
        );
        Assert.Equal(1, completed.Total);
        Assert.Equal(new DateOnly(2026, 1, 2), Assert.Single(completed.Items).PerformedDate);
        Assert.True(completed.Items[0].HasComment);
        var future = await scope.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 1, 31),
            f.Relationship,
            program.Id,
            1,
            1,
            default,
            status: "Scheduled"
        );
        Assert.Equal(all.Items[1].Id, Assert.Single(future.Items).Id);
        var empty = await scope.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 1, 31),
            f.Relationship,
            program.Id,
            1,
            10,
            default,
            cycleId: Guid.NewGuid()
        );
        Assert.Empty(empty.Items);
        var report = await scope.Service.ReadAsync(
            new(new(2026, 1, 1), new(2026, 1, 31), f.Relationship),
            default
        );
        Assert.Equal(2, report.Planned);
        Assert.Equal(1, report.Due);
        Assert.Equal(100m, report.CompletionPercentage);
        Assert.Equal(1800, report.TotalTrainingSeconds);
        Assert.Equal(1800, report.AverageSessionSeconds);
        Assert.Equal(all.Items[0].Id, Assert.Single(report.Performance).OccurrenceId);
        Assert.Equal(100m, report.Performance[0].VolumeKg);
        Assert.Equal(2, report.Weeks!.Length);
        var options = await scope.Service.ActivityOptionsAsync(f.Relationship, program.Id, default);
        Assert.Single(options.Programs);
        Assert.Equal(2, options.Structure.Length);
        var summary = Assert.Single(
            await scope.Service.AssignmentSummaryAsync(f.Relationship, default)
        );
        Assert.Equal(2, summary.Scheduled);
        Assert.Equal(1, summary.Completed);
        Assert.Equal(
            new DateOnly(2026, 1, 2),
            (await scope.Service.LastActivityAsync(f.Relationship, default)).PerformedDate
        );
        Assert.Equal(
            404,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    scope.Service.WorkoutAsync(all.Items[0].Id, default, Guid.NewGuid())
                )
            ).Status
        );
        var repsFiltered = await scope.Service.ReadAsync(
            new(new(2026, 1, 1), new(2026, 1, 31), f.Relationship, Repetitions: 6),
            default
        );
        Assert.Empty(repsFiltered.Performance);
        Assert.Equal(100m, repsFiltered.CompletionPercentage);
    }

    [TrainingPostgresFact]
    public async Task Activity_options_and_assignments_require_relationship_access()
    {
        await using var f = new Fixture();
        var program = await f.Seed();
        await f.Assign(program.Id);
        await using var outsider = f.Scope(Guid.NewGuid());
        await Assert.ThrowsAsync<ApiException>(() =>
            outsider.Service.ActivityOptionsAsync(f.Relationship, program.Id, default)
        );
        await Assert.ThrowsAsync<ApiException>(() =>
            outsider.Service.AssignmentSummaryAsync(f.Relationship, default)
        );
    }

    [TrainingPostgresFact]
    public async Task Assignment_retry_rechecks_revoked_relationship_access_before_returning_existing_batch()
    {
        await using var f = new Fixture();
        var program = await f.Seed();
        var request = new AssignProgramRequest(null, [f.Relationship], [], new(2026, 1, 1), "UTC");
        await using var scope = f.Scope(f.Coach);
        var batch = await scope.Service.AssignAsync(program.Id, request, "revoked-retry", default);
        f.Directory.AccessAllowed = false;
        Assert.Equal(
            403,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    scope.Service.GetAsync(batch.Assignments[0].Id, default)
                )
            ).Status
        );
        Assert.Equal(
            403,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    scope.Service.AssignAsync(program.Id, request, "revoked-retry", default)
                )
            ).Status
        );
        Assert.Equal(
            1,
            await scope.Db.Set<AssignmentBatch>().CountAsync(x => x.CoachId == f.Coach)
        );
        f.Directory.AccessAllowed = true;
        Assert.Equal(
            batch.Id,
            (await scope.Service.AssignAsync(program.Id, request, "revoked-retry", default)).Id
        );
    }

    [TrainingPostgresFact]
    public async Task Historical_access_does_not_authorize_assignment_management_or_execution_writes()
    {
        await using var f = new Fixture();
        var program = await f.Seed();
        var assignment = await f.Assign(program.Id);
        await using var coach = f.Scope(f.Coach);
        var occurrence = (
            await coach.Service.ScheduleAsync(
                new(2026, 1, 1),
                new(2026, 1, 31),
                null,
                null,
                1,
                100,
                default
            )
        ).Items[0];
        f.Directory.DeniedOperations.Add(RelationshipOperation.Manage);

        Assert.Equal(assignment.Id, (await coach.Service.GetAsync(assignment.Id, default)).Id);
        Assert.NotNull(await coach.Service.WorkoutAsync(occurrence.Id, default));
        Assert.Equal(
            403,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Service.SetStatusAsync(
                        assignment.Id,
                        AssignmentStatus.Paused,
                        assignment.Version,
                        default
                    )
                )
            ).Status
        );
        Assert.Equal(
            403,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Service.RefreshAsync(
                        assignment.Id,
                        Guid.NewGuid(),
                        assignment.Version,
                        default
                    )
                )
            ).Status
        );
        f.Directory.DeniedOperations.Clear();
        f.Directory.DeniedOperations.Add(RelationshipOperation.ProtectedWrite);
        Assert.Equal(
            403,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Service.StartAsync(occurrence.Id, default)
                )
            ).Status
        );
        Assert.Equal(
            403,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Service.SkipAsync(occurrence.Id, "Skip", default)
                )
            ).Status
        );
        await using var verify = f.Scope(f.Coach);
        var unchanged = await verify
            .Db.Set<ProgramAssignment>()
            .AsNoTracking()
            .SingleAsync(x => x.Id == assignment.Id);
        Assert.Equal(AssignmentStatus.Active, unchanged.Status);
        Assert.Equal(assignment.Version, unchanged.Version);
        Assert.False(
            await verify.Db.Set<WorkoutExecution>().AnyAsync(x => x.OccurrenceId == occurrence.Id)
        );

        Assert.Equal(
            AssignmentStatus.Paused,
            (
                await coach.Service.SetStatusAsync(
                    assignment.Id,
                    AssignmentStatus.Paused,
                    assignment.Version,
                    default
                )
            ).Status
        );
    }

    [TrainingPostgresFact]
    public async Task Schedule_reads_only_summary_columns_and_keeps_execution_status()
    {
        await using var f = new Fixture();
        var program = await f.Seed();
        await f.Assign(program.Id);
        await using var scope = f.Scope(f.Client);
        var before = await scope.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 1, 31),
            null,
            program.Id,
            1,
            100,
            default
        );
        var execution = await scope.Service.StartAsync(before.Items[0].Id, default);
        f.Queries.Commands.Clear();
        var after = await scope.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 1, 31),
            null,
            program.Id,
            1,
            100,
            default
        );
        Assert.Equal(2, after.Total);
        Assert.Equal(execution.Id, after.Items[0].ExecutionId);
        Assert.Equal("InProgress", after.Items[0].Status);
        Assert.Equal("Missed", after.Items[1].Status);
        Assert.Equal(new[] { "view" }, after.Items[0].AllowedActions);
        Assert.Equal(1, after.Items[0].PlannedSets);
        Assert.Null(after.Items[1].PlannedSets);
        Assert.Equal(3, f.Queries.Commands.Count);
        Assert.All(
            f.Queries.Commands,
            sql => Assert.DoesNotContain("SELECT o.\"Prescription\"", sql)
        );
        Assert.Contains(
            f.Queries.Commands,
            sql => sql.Contains("SUM(CASE", StringComparison.Ordinal)
        );
    }

    [TrainingPostgresFact]
    public async Task Closing_assignment_updates_future_occurrences_without_loading_snapshots()
    {
        await using var f = new Fixture();
        f.Clock.Now = new(2025, 12, 31, 12, 0, 0, TimeSpan.Zero);
        var program = await f.Seed();
        var assignment = await f.Assign(program.Id);
        await using var scope = f.Scope(f.Coach);
        var before = await scope.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 1, 31),
            null,
            program.Id,
            1,
            100,
            default
        );
        await scope.Service.StartAsync(before.Items[0].Id, default);
        f.Queries.Commands.Clear();
        await scope.Service.SetStatusAsync(
            assignment.Id,
            AssignmentStatus.Cancelled,
            assignment.Version,
            default
        );
        Assert.Single(
            f.Queries.Commands,
            sql => sql.StartsWith("UPDATE training.workout_occurrences", StringComparison.Ordinal)
        );
        Assert.All(f.Queries.Commands, sql => Assert.DoesNotContain("Prescription", sql));
        var after = await scope.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 1, 31),
            null,
            program.Id,
            1,
            100,
            default
        );
        Assert.Equal(before.Items[0].Id, Assert.Single(after.Items).Id);
        Assert.Equal(
            1,
            await scope
                .Db.Set<WorkoutOccurrence>()
                .CountAsync(x => x.AssignmentId == assignment.Id && x.Superseded)
        );
    }

    [TrainingPostgresFact]
    public async Task Canonical_exercise_renames_do_not_split_same_day_performance()
    {
        await using var f = new Fixture();
        var program = await f.Seed();
        await f.Assign(program.Id);
        await using var scope = f.Scope(f.Client);
        var schedule = await scope.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 1, 31),
            null,
            program.Id,
            1,
            100,
            default
        );
        var canonicalId = Guid.NewGuid();
        foreach (var occurrence in schedule.Items)
        {
            var started = await scope.Service.StartAsync(occurrence.Id, default);
            var saved = await scope.Service.SaveAsync(
                started.Id,
                new(
                    new(2026, 1, 1),
                    "",
                    null,
                    [
                        new(
                            null,
                            canonicalId,
                            "",
                            [
                                new(
                                    null,
                                    null,
                                    false,
                                    5,
                                    20,
                                    "kg",
                                    LoadMeaning.TotalExternal,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null
                                ),
                            ]
                        ),
                    ]
                ),
                started.Version,
                default
            );
            await scope.Service.CompleteAsync(started.Id, saved.Version, default);
        }
        var renamed = await scope
            .Db.Set<ExerciseExecution>()
            .FirstAsync(x => x.ExerciseId == canonicalId);
        renamed.Name = "Renamed canonical exercise";
        await scope.Db.SaveChangesAsync();
        var report = await scope.Service.ReadAsync(
            new(new(2026, 1, 1), new(2026, 1, 31), ExerciseId: canonicalId),
            default
        );
        var point = Assert.Single(report.Performance);
        Assert.Equal(canonicalId, point.ExerciseId);
        Assert.Equal(2, point.Sets);
        Assert.Equal(10, point.Reps);
        Assert.Equal(200, point.VolumeKg);
        Assert.Equal("Renamed canonical exercise", point.Name);
    }

    [TrainingPostgresFact]
    public async Task Unpublished_cross_coach_targets_and_mismatched_idempotency_requests_are_rejected()
    {
        await using var f = new Fixture();
        var program = await f.Seed();
        await using var scope = f.Scope(f.Coach);
        var draft = new TrainingPlan
        {
            Id = Guid.NewGuid(),
            OwnerId = f.Coach,
            WorkspaceId = f.Coach,
            Name = "Draft",
            CreatedAt = f.Clock.Now,
            UpdatedAt = f.Clock.Now,
        };
        scope.Db.Add(draft);
        await scope.Db.SaveChangesAsync();
        var request = new AssignProgramRequest(null, [f.Relationship], [], new(2026, 1, 1), "UTC");
        Assert.Equal(
            400,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    scope.Service.AssignAsync(draft.Id, request, "draft", default)
                )
            ).Status
        );
        Assert.Equal(
            404,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    scope.Service.AssignAsync(
                        program.Id,
                        request with
                        {
                            GroupIds = [Guid.NewGuid()],
                        },
                        "foreign-group",
                        default
                    )
                )
            ).Status
        );
        Assert.Equal(
            404,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    scope.Service.AssignAsync(
                        program.Id,
                        request with
                        {
                            RelationshipIds = [Guid.NewGuid()],
                        },
                        "foreign-relationship",
                        default
                    )
                )
            ).Status
        );
    }

    [TrainingPostgresFact]
    public async Task Simultaneous_start_and_assignment_retries_create_one_record()
    {
        await using var f = new Fixture();
        var program = await f.Seed();
        await using var one = f.Scope(f.Coach);
        await using var two = f.Scope(f.Coach);
        var request = new AssignProgramRequest(null, [f.Relationship], [], new(2026, 1, 1), "UTC");
        var batches = await Task.WhenAll(
            one.Service.AssignAsync(program.Id, request, "double-click", default),
            two.Service.AssignAsync(program.Id, request, "double-click", default)
        );
        Assert.Equal(batches[0].Id, batches[1].Id);
        var occurrence = (
            await one.Service.ScheduleAsync(
                new(2026, 1, 1),
                new(2026, 1, 31),
                null,
                program.Id,
                1,
                100,
                default
            )
        ).Items[0];
        await using var a = f.Scope(f.Client);
        await using var b = f.Scope(f.Client);
        var executions = await Task.WhenAll(
            a.Service.StartAsync(occurrence.Id, default),
            b.Service.StartAsync(occurrence.Id, default)
        );
        Assert.Equal(executions[0].Id, executions[1].Id);
        Assert.Equal(
            1,
            await one.Db.Set<WorkoutExecution>().CountAsync(x => x.OccurrenceId == occurrence.Id)
        );
    }

    [TrainingPostgresFact]
    public async Task Group_and_individual_deduplicate_idempotently_without_dynamic_membership_or_source_mutation()
    {
        await using var f = new Fixture();
        var program = await f.Seed();
        await using var scope = f.Scope(f.Coach);
        var s = scope.Service;
        var anotherGroup = Guid.NewGuid();
        f.Directory.Groups.Add(anotherGroup);
        var request = new AssignProgramRequest(
            null,
            [f.Relationship],
            [f.Group, anotherGroup],
            new(2026, 1, 1),
            "Europe/Warsaw"
        );
        var result = await s.AssignAsync(program.Id, request, "batch", default);
        Assert.Equal(2, result.Assignments.Length);
        Assert.All(result.Assignments, x => Assert.Equal("Group", x.Source));
        Assert.Equal(2, (await s.ListAsync(null, program.Id, anotherGroup, 1, 100, default)).Total);
        Assert.Equal(
            4,
            await scope
                .Db.Set<AssignmentGroupSource>()
                .CountAsync(x => result.Assignments.Select(a => a.Id).Contains(x.AssignmentId))
        );
        Assert.Equal(result.Id, (await s.AssignAsync(program.Id, request, "batch", default)).Id);
        Assert.Equal(
            "IDEMPOTENCY_CONFLICT",
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    s.AssignAsync(
                        program.Id,
                        request with
                        {
                            StartDate = new(2026, 1, 2),
                        },
                        "batch",
                        default
                    )
                )
            ).Code
        );
        Assert.Equal(
            2,
            await scope.Db.Set<ProgramAssignment>().CountAsync(x => x.BatchId == result.Id)
        );
        var a = result.Assignments[0];
        await s.SetStatusAsync(a.Id, AssignmentStatus.Cancelled, a.Version, default);
        Assert.Equal(2, f.Directory.GroupMembers.Count);
        f.Directory.GroupMembers.Add(Guid.NewGuid());
        Assert.Equal(
            2,
            await scope.Db.Set<ProgramAssignment>().CountAsync(x => x.BatchId == result.Id)
        );
        var direct = await s.AssignAsync(
            program.Id,
            request with
            {
                GroupIds = [],
                StartDate = new(2026, 2, 1),
            },
            "another",
            default
        );
        Assert.Single(direct.Assignments);
        Assert.Equal(1, await scope.Db.Revisions.CountAsync(x => x.PlanId == program.Id));
    }

    [TrainingPostgresFact]
    public async Task Actual_logs_start_blank_freeze_prescription_allow_extra_substituted_sets_and_overwrite_with_concurrency()
    {
        await using var f = new Fixture();
        var program = await f.Seed();
        var assignment = await f.Assign(program.Id);
        await using var client = f.Scope(f.Client);
        var s = client.Service;
        var schedule = await s.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 1, 31),
            null,
            null,
            1,
            100,
            default
        );
        var o = schedule.Items[0];
        var started = await s.StartAsync(o.Id, default);
        Assert.Empty(started.Exercises);
        Assert.Equal(started.Id, (await s.StartAsync(o.Id, default)).Id);
        Assert.Equal(
            400,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    s.CompleteAsync(started.Id, started.Version, default)
                )
            ).Status
        );
        var detail = await s.WorkoutAsync(o.Id, default);
        var prescribed = detail.Prescription.Workout.Exercises.Single();
        var substitute = Guid.NewGuid();
        var set = new ActualSet(
            prescribed.Sets[0].Id,
            null,
            false,
            8,
            50,
            "kg",
            LoadMeaning.TotalExternal,
            8,
            2,
            null,
            null,
            90,
            "2-0-1-0",
            "actual"
        );
        var request = new SaveExecutionRequest(
            new(2026, 1, 1),
            "late log",
            3600,
            [
                new(
                    prescribed.Id,
                    substitute,
                    "substitution",
                    [set, set with { PrescribedSetId = null, Reps = 5 }]
                ),
            ]
        );
        var saved = await s.SaveAsync(started.Id, request, started.Version, default);
        Assert.Equal(
            "VERSION_CONFLICT",
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    s.SaveAsync(started.Id, request, started.Version, default)
                )
            ).Code
        );
        var complete = await s.CompleteAsync(started.Id, saved.Version, default);
        Assert.Equal(complete.Id, (await s.CompleteAsync(started.Id, saved.Version, default)).Id);
        Assert.Equal(ExecutionStatus.Completed, complete.Status);
        await using var coach = f.Scope(f.Coach);
        var correction = await coach.Service.SaveAsync(
            complete.Id,
            request with
            {
                Comment = "corrected",
            },
            complete.Version,
            default
        );
        Assert.Equal("corrected", correction.Comment);
        Assert.Equal(
            "VERSION_CONFLICT",
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Service.CompleteAsync(complete.Id, complete.Version, default)
                )
            ).Code
        );
        var read = await coach.Service.WorkoutAsync(o.Id, default);
        Assert.Equal(
            prescribed.ExerciseId,
            read.Prescription.Workout.Exercises.Single().ExerciseId
        );
        Assert.NotEqual(substitute, read.Prescription.Workout.Exercises.Single().ExerciseId);
        var report = await coach.Service.ReadAsync(
            new(new(2026, 1, 1), new(2026, 1, 31), f.Relationship),
            default
        );
        Assert.Equal(2, report.ActualSets);
        Assert.Equal(13, report.ActualReps);
        Assert.Equal(650, report.VolumeKg);
        Assert.Equal(2, Assert.Single(report.Performance).SubstitutionSets);
        Assert.Equal(1, report.LoggedLate);
        Assert.Equal(1, report.Completed);
        Assert.Equal(50m, report.CompletionPercentage);
        Assert.True(read.Occurrence.LoggedLate);
        Assert.Equal(
            2,
            await coach
                .Db.Set<SetExecution>()
                .CountAsync(x =>
                    coach
                        .Db.Set<ExerciseExecution>()
                        .Any(e => e.ExecutionId == complete.Id && e.Id == x.ExerciseExecutionId)
                )
        );
    }

    [TrainingPostgresFact]
    public async Task Relationship_recheck_and_foreign_coach_never_leak_or_permit_writes()
    {
        await using var f = new Fixture();
        var program = await f.Seed();
        var a = await f.Assign(program.Id);
        await using var stranger = f.Scope(Guid.NewGuid());
        Assert.Equal(
            404,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    stranger.Service.GetAsync(a.Id, default)
                )
            ).Status
        );
        Assert.Equal(
            404,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    stranger.Service.ReadAsync(
                        new(new(2026, 1, 1), new(2026, 1, 31), f.Relationship),
                        default
                    )
                )
            ).Status
        );
        await using var client = f.Scope(f.Client);
        var occurrence = (
            await client.Service.ScheduleAsync(
                new(2026, 1, 1),
                new(2026, 1, 31),
                null,
                null,
                1,
                100,
                default
            )
        ).Items[0];
        f.Directory.Status = RelationshipStatus.Suspended;
        Assert.Equal(
            403,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    client.Service.WorkoutAsync(occurrence.Id, default)
                )
            ).Status
        );
        Assert.Equal(
            403,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    client.Service.StartAsync(occurrence.Id, default)
                )
            ).Status
        );
        f.Directory.Status = RelationshipStatus.Completed;
        Assert.NotNull(await client.Service.WorkoutAsync(occurrence.Id, default));
        Assert.Equal(
            403,
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    client.Service.StartAsync(occurrence.Id, default)
                )
            ).Status
        );
    }

    [TrainingPostgresFact]
    public async Task Structural_revision_refresh_keeps_started_workout_identity_date_and_snapshot()
    {
        await using var f = new Fixture();
        f.Clock.Now = new(2025, 12, 31, 12, 0, 0, TimeSpan.Zero);
        var program = await f.Seed();
        var a = await f.Assign(program.Id);
        await using var client = f.Scope(f.Client);
        var schedule = await client.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 2, 1),
            null,
            null,
            1,
            100,
            default
        );
        var started = await client.Service.StartAsync(schedule.Items[0].Id, default);
        await using var coach = f.Scope(f.Coach);
        var original = await coach.Db.Revisions.SingleAsync(x => x.PlanId == program.Id);
        var blocks = original.Snapshot.Document.Blocks;
        var changed = blocks[0] with { Cycles = blocks[0].Cycles.Reverse().ToArray() };
        var revision = new TrainingRevision
        {
            Id = Guid.NewGuid(),
            PlanId = program.Id,
            Number = 2,
            DraftVersion = 2,
            PublishedAt = f.Clock.Now,
            IdempotencyKey = "new",
            RequestHash = "new",
            Snapshot = original.Snapshot with { Document = new(1, [changed]), Name = "Updated" },
        };
        coach.Db.Add(revision);
        await coach.Db.SaveChangesAsync();
        await coach.Service.RefreshAsync(a.Id, revision.Id, a.Version, default);
        var after = await coach.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 2, 1),
            null,
            null,
            1,
            100,
            default
        );
        Assert.Equal(2, after.Items.Length);
        Assert.Contains(
            after.Items,
            x => x.Id == schedule.Items[0].Id && x.ScheduledDate == schedule.Items[0].ScheduledDate
        );
        Assert.Equal(
            original.Id,
            (await coach.Service.WorkoutAsync(schedule.Items[0].Id, default))
                .Prescription
                .RevisionId
        );
        Assert.Single(after.Items, x => x.RevisionId == revision.Id);
    }

    [TrainingPostgresFact]
    public async Task Paused_future_due_and_skip_semantics_do_not_invent_completed_training()
    {
        await using var f = new Fixture();
        f.Clock.Now = new(2025, 12, 31, 12, 0, 0, TimeSpan.Zero);
        var p = await f.Seed();
        var a = await f.Assign(p.Id);
        await using var coach = f.Scope(f.Coach);
        var future = await coach.Service.ReadAsync(new(new(2026, 1, 1), new(2026, 1, 31)), default);
        Assert.Equal(0, future.Due);
        Assert.Equal(0, future.Missed);
        Assert.Null(future.CompletionPercentage);
        var paused = await coach.Service.SetStatusAsync(
            a.Id,
            AssignmentStatus.Paused,
            a.Version,
            default
        );
        Assert.Equal(
            "VERSION_CONFLICT",
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    coach.Service.SetStatusAsync(a.Id, AssignmentStatus.Paused, a.Version, default)
                )
            ).Code
        );
        var o = (
            await coach.Service.ScheduleAsync(
                new(2026, 1, 1),
                new(2026, 1, 31),
                null,
                null,
                1,
                100,
                default
            )
        ).Items[0];
        await using var client = f.Scope(f.Client);
        Assert.Equal(
            "ASSIGNMENT_INACTIVE",
            (
                await Assert.ThrowsAsync<ApiException>(() =>
                    client.Service.StartAsync(o.Id, default)
                )
            ).Code
        );
        await coach.Service.SetStatusAsync(a.Id, AssignmentStatus.Active, paused.Version, default);
        f.Clock.Now = new(2026, 2, 1, 12, 0, 0, TimeSpan.Zero);
        var skip = await client.Service.SkipAsync(o.Id, "rest", default);
        var report = await coach.Service.ReadAsync(new(new(2026, 1, 1), new(2026, 1, 31)), default);
        Assert.Equal(1, report.Skipped);
        Assert.Equal(1, report.Missed);
        Assert.Equal(0, report.Completed);
        Assert.Equal(skip.Id, (await client.Service.StartAsync(o.Id, default)).Id);
    }

    [TrainingPostgresFact]
    public async Task Team_closure_preserves_executions_and_other_relationship_assignments()
    {
        await using var f = new Fixture();
        f.Clock.Now = new(2025, 12, 31, 12, 0, 0, TimeSpan.Zero);
        var program = await f.Seed();
        var assignment = await f.Assign(program.Id);
        await using var scope = f.Scope(f.Coach);
        var personal = Assert.Single(
            (
                await scope.Service.AssignAsync(
                    program.Id,
                    new(null, [f.Directory.GroupMembers[1]], [], new(2026, 1, 1), "Europe/Warsaw"),
                    "private-" + Guid.NewGuid(),
                    default
                )
            ).Assignments
        );
        var schedule = await scope.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 1, 31),
            f.Relationship,
            program.Id,
            1,
            100,
            default
        );
        await using var client = f.Scope(f.Client);
        var execution = await client.Service.StartAsync(schedule.Items[0].Id, default);
        await using var tx = await scope.Db.Database.BeginTransactionAsync();
        var lifecycle = new TeamTrainingLifecycle(scope.Db, new Notifications());
        await lifecycle.CloseAsync(Guid.NewGuid(), [f.Relationship], f.Coach, f.Clock.Now, default);
        await lifecycle.CloseAsync(Guid.NewGuid(), [f.Relationship], f.Coach, f.Clock.Now, default);
        await tx.CommitAsync();
        Assert.Equal(
            AssignmentStatus.Cancelled,
            (
                await scope
                    .Db.Set<ProgramAssignment>()
                    .AsNoTracking()
                    .SingleAsync(x => x.Id == assignment.Id)
            ).Status
        );
        Assert.Equal(
            AssignmentStatus.Active,
            (
                await scope
                    .Db.Set<ProgramAssignment>()
                    .AsNoTracking()
                    .SingleAsync(x => x.Id == personal.Id)
            ).Status
        );
        Assert.Single(
            await scope
                .Db.Set<WorkoutOccurrence>()
                .AsNoTracking()
                .Where(x => x.AssignmentId == assignment.Id && x.Superseded)
                .ToArrayAsync()
        );
        Assert.Equal(
            execution.Id,
            (
                await scope
                    .Db.Set<WorkoutExecution>()
                    .AsNoTracking()
                    .SingleAsync(x => x.Id == execution.Id)
            ).Id
        );
    }

    [TrainingPostgresFact]
    public async Task Refresh_updates_today_before_execution_without_rewriting_past_workouts()
    {
        await using var f = new Fixture();
        f.Clock.Now = new(2026, 1, 11, 12, 0, 0, TimeSpan.Zero);
        var program = await f.Seed();
        var assignment = await f.Assign(program.Id);
        await using var coach = f.Scope(f.Coach);
        var before = await coach.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 2, 1),
            null,
            null,
            1,
            100,
            default
        );
        var original = await coach.Db.Revisions.SingleAsync(x => x.PlanId == program.Id);
        var revision = new TrainingRevision
        {
            Id = Guid.NewGuid(),
            PlanId = program.Id,
            Number = 2,
            DraftVersion = 2,
            PublishedAt = f.Clock.Now,
            IdempotencyKey = "today",
            RequestHash = "today",
            Snapshot = original.Snapshot with { Name = "Updated" },
        };
        coach.Db.Add(revision);
        await coach.Db.SaveChangesAsync();
        await coach.Service.RefreshAsync(assignment.Id, revision.Id, assignment.Version, default);
        var after = await coach.Service.ScheduleAsync(
            new(2026, 1, 1),
            new(2026, 2, 1),
            null,
            null,
            1,
            100,
            default
        );
        Assert.Equal(
            original.Id,
            after.Items.Single(x => x.ScheduledDate == new DateOnly(2026, 1, 1)).RevisionId
        );
        Assert.Equal(
            revision.Id,
            after.Items.Single(x => x.ScheduledDate == new DateOnly(2026, 1, 11)).RevisionId
        );
        Assert.Equal(2, after.Items.Length);
    }

    [TrainingPostgresFact]
    public async Task Apply_refreshes_assignments_but_draft_save_does_not()
    {
        await using var f = new Fixture();
        f.Clock.Now = new(2026, 1, 11, 12, 0, 0, TimeSpan.Zero);
        var plan = await f.Seed();
        var assignment = await f.Assign(plan.Id);
        await using var scope = f.Scope(f.Coach);
        var doc = plan.Draft with
        {
            Blocks = plan
                .Draft.Blocks.Select(b =>
                    b with
                    {
                        Cycles = b
                            .Cycles.Select(c =>
                                c with
                                {
                                    Days = c
                                        .Days.Select(d =>
                                            d with
                                            {
                                                Workouts = d
                                                    .Workouts.Select(w => w with { Exercises = [] })
                                                    .ToArray(),
                                            }
                                        )
                                        .ToArray(),
                                }
                            )
                            .ToArray(),
                    }
                )
                .ToArray(),
        };
        var saved = await scope.Programs.SaveAsync(
            plan.Id,
            new("Changed", "", null, doc),
            plan.Version,
            default
        );
        Assert.Equal(
            assignment.EffectiveRevisionId,
            (await scope.Service.GetAsync(assignment.Id, default)).EffectiveRevisionId
        );
        var applied = await scope.Programs.ApplyAsync(plan.Id, saved.Version, "apply", default);
        Assert.Equal(
            applied.Id,
            (await scope.Service.GetAsync(assignment.Id, default)).EffectiveRevisionId
        );
        Assert.Equal(
            applied.Id,
            (await scope.Programs.ApplyAsync(plan.Id, saved.Version, "apply", default)).Id
        );
        Assert.Equal(
            applied.Id,
            (await scope.Programs.ApplyAsync(plan.Id, saved.Version, "unchanged", default)).Id
        );
        Assert.Equal(2, await scope.Db.Revisions.CountAsync(x => x.PlanId == plan.Id));
    }

    [TrainingPostgresFact]
    public async Task Program_ending_alerts_reach_the_coach_once_per_chosen_moment()
    {
        await using var f = new Fixture();
        // Two cycles in one block: workouts on Jan 1 and Jan 11; assigned the day before it starts.
        f.Clock.Now = new(2025, 12, 31, 12, 0, 0, TimeSpan.Zero);
        var program = await f.Seed();
        var assignment = await f.Assign(program.Id);
        await using var coach = f.Scope(f.Coach);
        var sent = new SentNotifications();
        var job = new ProgramEndingAlertsJob(
            coach.Db,
            new EndingChoice(f.Coach, ProgramEndingAlerts.All),
            sent,
            f.Clock
        );

        f.Clock.Now = new(2026, 1, 2, 12, 0, 0, TimeSpan.Zero);
        await job.RunAsync(default);
        Assert.Equal([$"training-ending:{assignment.Id}:LastBlock"], sent.Keys(assignment.Id));

        f.Clock.Now = new(2026, 1, 11, 9, 0, 0, TimeSpan.Zero);
        await job.RunAsync(default);
        Assert.Equal(
            ["LastBlock", "LastBlock", "LastCycle", "LastWeek", "LastWorkout"],
            sent.Keys(assignment.Id).Select(x => x.Split(':')[2]).Order()
        );
        var alert = sent.Events.Last(x => x.SourceId == assignment.Id);
        Assert.Equal(f.Coach, alert.RecipientUserId);
        Assert.Equal($"/app/clients/{f.Relationship}", alert.DeepLink);

        // After the last workout day nothing more is sent.
        f.Clock.Now = new(2026, 1, 13, 9, 0, 0, TimeSpan.Zero);
        var before = sent.Keys(assignment.Id).Length;
        await job.RunAsync(default);
        Assert.Equal(before, sent.Keys(assignment.Id).Length);
    }

    private sealed class SentNotifications : INotificationPublisher
    {
        public List<NotificationEvent> Events { get; } = [];

        public string[] Keys(Guid source) =>
            Events.Where(x => x.SourceId == source).Select(x => x.EventKey).ToArray();

        public Task PublishAsync(NotificationEvent e, CancellationToken ct)
        {
            Events.Add(e);
            return Task.CompletedTask;
        }

        public Task CancelScheduledAsync(string module, Guid id, CancellationToken ct) =>
            Task.CompletedTask;
    }

    private sealed class EndingChoice(Guid coach, string[] kinds) : IProgramEndingAlertPreferences
    {
        public Task<IReadOnlyDictionary<Guid, string[]>> GetAsync(
            IReadOnlyCollection<Guid> coachIds,
            CancellationToken ct
        ) =>
            Task.FromResult<IReadOnlyDictionary<Guid, string[]>>(
                coachIds.ToDictionary(id => id, id => id == coach ? kinds : [])
            );
    }

    private sealed class Fixture : IAsyncDisposable
    {
        public Guid Coach { get; } = Guid.NewGuid();
        public Guid Client { get; } = Guid.NewGuid();
        public Guid Relationship { get; } = Guid.NewGuid();
        public Guid Group { get; } = Guid.NewGuid();
        public MutableClock Clock { get; } = new();
        public Directory Directory { get; }
        public bool EnableClientFormulas { get; set; }
        public Profiles Profiles { get; } = new();
        public QueryLog Queries { get; } = new();
        private readonly NpgsqlDataSource source = NpgsqlDataSource.Create(
            Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!
        );

        public Fixture()
        {
            Directory = new(Coach, Client, Relationship, Group);
        }

        public TestScope Scope(Guid actor) => new(source, actor, this);

        public async Task<TrainingPlan> Seed(
            SetKind kind = SetKind.Standard,
            Prescription? target = null
        )
        {
            await using var scope = Scope(Coach);
            var exercise = new ExerciseInstance(
                Guid.NewGuid(),
                Guid.NewGuid(),
                "",
                [new(Guid.NewGuid(), kind, target ?? new(Reps: new(5, 8)))]
            );
            Workout W() =>
                new(Guid.NewGuid(), "Session", "", [exercise with { Id = Guid.NewGuid() }], []);
            var document = new TrainingDocument(
                1,
                [
                    new(
                        Guid.NewGuid(),
                        "Block",
                        "",
                        [
                            new(Guid.NewGuid(), "10", "", 10, [new(Guid.NewGuid(), 1, [W()])]),
                            new(Guid.NewGuid(), "7", "", 7, [new(Guid.NewGuid(), 1, [W()])]),
                        ]
                    ),
                ]
            );
            var plan = new TrainingPlan
            {
                Id = Guid.NewGuid(),
                OwnerId = Coach,
                WorkspaceId = Coach,
                Name = "Program",
                Draft = document,
                CreatedAt = Clock.Now,
                UpdatedAt = Clock.Now,
            };
            scope.Db.Add(plan);
            scope.Db.Add(
                new TrainingRevision
                {
                    Id = Guid.NewGuid(),
                    PlanId = plan.Id,
                    Number = 1,
                    DraftVersion = 1,
                    IdempotencyKey = "published",
                    RequestHash = "published",
                    PublishedAt = Clock.Now,
                    Snapshot = new(
                        1,
                        plan.Name,
                        "",
                        DocumentKind.Program,
                        document,
                        new()
                        {
                            [exercise.ExerciseId] = new(exercise.ExerciseId, 1, "Squat", "", ""),
                        },
                        []
                    ),
                }
            );
            await scope.Db.SaveChangesAsync();
            return plan;
        }

        public async Task<AssignmentDto> Assign(Guid program)
        {
            await using var scope = Scope(Coach);
            return Assert.Single(
                (
                    await scope.Service.AssignAsync(
                        program,
                        new(null, [Relationship], [], new(2026, 1, 1), "Europe/Warsaw"),
                        Guid.NewGuid().ToString(),
                        default
                    )
                ).Assignments
            );
        }

        public ValueTask DisposeAsync() => source.DisposeAsync();
    }

    private sealed class TestScope : IAsyncDisposable
    {
        private readonly ServiceProvider provider;
        public TrainingDbContext Db { get; }
        public TrainingDeliveryService Service { get; }
        public TrainingService Programs { get; }

        public TestScope(NpgsqlDataSource source, Guid user, Fixture f)
        {
            var services = new ServiceCollection();
            services.AddSingleton(source);
            services.AddModuleDatabase<TrainingDbContext>("training");
            services.AddDbContext<TrainingDbContext>(options => options.AddInterceptors(f.Queries));
            provider = services.BuildServiceProvider();
            Db = provider.GetRequiredService<TrainingDbContext>();
            Programs = new(
                Db,
                new Account(user, f.Coach),
                new Features(),
                new Catalog(),
                Options.Create(new TrainingOptions()),
                f.Clock,
                new Policy(user, f.Directory),
                provider.GetRequiredService<ModuleTransaction>(),
                [],
                profileFields: f.EnableClientFormulas ? f.Profiles : null,
                metricRelationships: f.Directory
            );
            Service = new(
                Db,
                new Account(user, f.Coach),
                new Features(),
                f.Directory,
                new Policy(user, f.Directory),
                new Catalog(),
                new Notifications(),
                provider.GetRequiredService<ModuleTransaction>(),
                f.Clock,
                new AccountsDirectory(),
                [],
                formulaService: f.EnableClientFormulas ? Programs : null
            );
        }

        public ValueTask DisposeAsync() => provider.DisposeAsync();
    }

    private sealed class Profiles : IAccountProfileFields
    {
        public Dictionary<SystemFieldKey, System.Text.Json.JsonElement> Values { get; } = [];
        public long Version { get; set; } = 1;

        public Task<AccountProfileFields> GetAllowedForUserAsync(Guid id, CancellationToken ct) =>
            Task.FromResult(new AccountProfileFields("PLN", Values, Version));

        public Task<AccountProfileFields> GetOwnAsync(CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<AccountProfileFields> UpdateOwnAsync(
            IReadOnlyDictionary<SystemFieldKey, System.Text.Json.JsonElement> values,
            long version,
            CancellationToken ct
        ) => throw new NotSupportedException();

        public Task<AccountProfileFields> UpdateCurrencyOwnAsync(
            string currency,
            long version,
            CancellationToken ct
        ) => throw new NotSupportedException();

        public Task<string> GetCurrencyAsync(Guid id, CancellationToken ct) =>
            Task.FromResult("PLN");
    }

    private sealed class QueryLog : DbCommandInterceptor
    {
        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default
        )
        {
            Commands.Enqueue(command.CommandText);
            return ValueTask.FromResult(result);
        }

        public System.Collections.Concurrent.ConcurrentQueue<string> Commands { get; } = new();

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default
        )
        {
            Commands.Enqueue(command.CommandText);
            return ValueTask.FromResult(result);
        }
    }

    private sealed class MutableClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 2, 1, 12, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class Account(Guid user, Guid coach) : IAccountContext
    {
        public Guid UserId => user;

        public Task<AccountIdentity> RequireCoachAsync(CancellationToken ct) =>
            user == coach
                ? Task.FromResult(new AccountIdentity(user, user))
                : Task.FromException<AccountIdentity>(
                    new ApiException(403, "ROLE_REQUIRED", "Coach required.")
                );

        public Task<AccountIdentity> RequireClientAsync(CancellationToken ct) =>
            Task.FromResult(new AccountIdentity(user, user));

        public Task<IReadOnlyList<AccountRole>> GetRolesAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<AccountRole>>(
                user == coach ? [AccountRole.Coach] : [AccountRole.Client]
            );

        public Task RequireAdminAsync(string permission, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private sealed class Directory(Guid coach, Guid client, Guid relationship, Guid group)
        : IRelationshipRecipients
    {
        public bool AccessAllowed { get; set; } = true;
        public HashSet<RelationshipOperation> DeniedOperations { get; } = [];
        public RelationshipStatus Status { get; set; }
        public List<Guid> GroupMembers { get; } = [relationship, Guid.NewGuid()];
        public HashSet<Guid> Groups { get; } = [group];

        public RelationshipRecipient Row(Guid id) =>
            new(id, coach, coach, id == relationship ? client : Guid.NewGuid(), Status);

        public Task<RelationshipRecipient?> GetAsync(Guid id, CancellationToken ct) =>
            Task.FromResult<RelationshipRecipient?>(
                id == relationship || GroupMembers.Contains(id) ? Row(id) : null
            );

        public Task<IReadOnlyList<RelationshipRecipient>> GetForUserAsync(
            Guid user,
            bool isCoach,
            CancellationToken ct
        ) =>
            Task.FromResult<IReadOnlyList<RelationshipRecipient>>(
                user == coach ? GroupMembers.Select(Row).ToArray()
                : user == client ? [Row(relationship)]
                : []
            );

        public Task<IReadOnlyList<RelationshipRecipient>> ResolveActiveAsync(
            Guid coachId,
            Guid workspace,
            IReadOnlyCollection<Guid> ids,
            IReadOnlyCollection<Guid> groups,
            CancellationToken ct
        )
        {
            if (
                coachId != coach
                || groups.Any(x => !Groups.Contains(x))
                || ids.Any(x => !GroupMembers.Contains(x))
                || Status != RelationshipStatus.Active
            )
                throw ApiException.NotFound();
            return Task.FromResult<IReadOnlyList<RelationshipRecipient>>(
                ids.Concat(groups.Count > 0 ? GroupMembers : []).Distinct().Select(Row).ToArray()
            );
        }
    }

    private sealed class Policy(Guid user, Directory directory) : IRelationshipAccessPolicy
    {
        public async Task<RelationshipAccessDecision> DecideAsync(
            Guid id,
            RelationshipOperation op,
            CancellationToken ct
        )
        {
            var r = await directory.GetAsync(id, ct);
            var allowed =
                directory.AccessAllowed
                && !directory.DeniedOperations.Contains(op)
                && r != null
                && (r.CoachId == user || r.ClientId == user)
                && (
                    op == RelationshipOperation.ProtectedWrite
                        ? r.Status == RelationshipStatus.Active
                        : r.CoachId == user || r.Status != RelationshipStatus.Suspended
                );
            return new(allowed, allowed ? "ALLOWED" : "DENIED", r?.Status);
        }

        public async Task<IReadOnlyDictionary<Guid, RelationshipAccessDecision>> DecideManyAsync(
            IReadOnlyCollection<Guid> ids,
            RelationshipOperation op,
            CancellationToken ct
        )
        {
            var d = new Dictionary<Guid, RelationshipAccessDecision>();
            foreach (var id in ids)
                d[id] = await DecideAsync(id, op, ct);
            return d;
        }
    }

    private sealed class Features : IFeatureAccessService
    {
        public Task RequireAsync(string key, CancellationToken ct) => Task.CompletedTask;

        public Task<AccessSnapshot> GetAsync(CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private sealed class Catalog : IExerciseCatalog
    {
        public Task<IReadOnlyDictionary<Guid, ExerciseSnapshot>> SnapshotAsync(
            IEnumerable<Guid> ids,
            CancellationToken ct
        ) =>
            Task.FromResult<IReadOnlyDictionary<Guid, ExerciseSnapshot>>(
                ids.Distinct()
                    .ToDictionary(
                        x => x,
                        x => new ExerciseSnapshot(x, 1, "Actual exercise", "", "")
                    )
            );

        public Task<IReadOnlyDictionary<string, ExerciseSnapshot>> MatchNamesAsync(
            IEnumerable<string> names,
            CancellationToken ct
        ) => throw new NotSupportedException();
    }

    private sealed class Notifications : INotificationPublisher
    {
        public Task PublishAsync(NotificationEvent e, CancellationToken ct) => Task.CompletedTask;

        public Task CancelScheduledAsync(string module, Guid id, CancellationToken ct) =>
            Task.CompletedTask;
    }

    private sealed class AccountsDirectory : IAccountDirectory
    {
        public Task<IReadOnlyDictionary<Guid, AccountDirectoryEntry>> GetAccountsAsync(
            IReadOnlyCollection<Guid> ids,
            CancellationToken ct
        ) =>
            Task.FromResult<IReadOnlyDictionary<Guid, AccountDirectoryEntry>>(
                ids.ToDictionary(
                    x => x,
                    x => new AccountDirectoryEntry(
                        x,
                        x,
                        "client" + x.ToString("N"),
                        "Client " + x,
                        [AccountRole.Client]
                    )
                )
            );
    }
}
