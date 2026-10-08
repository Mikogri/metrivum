using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Training.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TrainingDeliveryAndGenerator : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "assignment_batches",
                schema: "training",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    IdempotencyKey = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    RequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assignment_batches", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "program_generations",
                schema: "training",
                columns: table => new
                {
                    ProgramId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    IdempotencyKey = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    RequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    StateJson = table.Column<string>(type: "jsonb", nullable: false),
                    DocumentHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    AssumptionsJson = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_program_generations", x => x.ProgramId);
                    table.ForeignKey(
                        name: "FK_program_generations_plans_ProgramId",
                        column: x => x.ProgramId,
                        principalSchema: "training",
                        principalTable: "plans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "group_assignments",
                schema: "training",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BatchId = table.Column<Guid>(type: "uuid", nullable: false),
                    GroupId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_group_assignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_group_assignments_assignment_batches_BatchId",
                        column: x => x.BatchId,
                        principalSchema: "training",
                        principalTable: "assignment_batches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "assignments",
                schema: "training",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BatchId = table.Column<Guid>(type: "uuid", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProgramId = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginalRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    EffectiveRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    GroupAssignmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    TimeZone = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ProgramName = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_assignments_assignment_batches_BatchId",
                        column: x => x.BatchId,
                        principalSchema: "training",
                        principalTable: "assignment_batches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_assignments_group_assignments_GroupAssignmentId",
                        column: x => x.GroupAssignmentId,
                        principalSchema: "training",
                        principalTable: "group_assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_assignments_plans_ProgramId",
                        column: x => x.ProgramId,
                        principalSchema: "training",
                        principalTable: "plans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_assignments_revisions_EffectiveRevisionId",
                        column: x => x.EffectiveRevisionId,
                        principalSchema: "training",
                        principalTable: "revisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_assignments_revisions_OriginalRevisionId",
                        column: x => x.OriginalRevisionId,
                        principalSchema: "training",
                        principalTable: "revisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "assignment_group_sources",
                schema: "training",
                columns: table => new
                {
                    AssignmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    GroupAssignmentId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assignment_group_sources", x => new { x.AssignmentId, x.GroupAssignmentId });
                    table.ForeignKey(
                        name: "FK_assignment_group_sources_assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalSchema: "training",
                        principalTable: "assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_assignment_group_sources_group_assignments_GroupAssignmentId",
                        column: x => x.GroupAssignmentId,
                        principalSchema: "training",
                        principalTable: "group_assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "workout_occurrences",
                schema: "training",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    BlockId = table.Column<Guid>(type: "uuid", nullable: false),
                    CycleId = table.Column<Guid>(type: "uuid", nullable: false),
                    DayId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkoutId = table.Column<Guid>(type: "uuid", nullable: false),
                    ScheduledDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Deadline = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Superseded = table.Column<bool>(type: "boolean", nullable: false),
                    Prescription = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workout_occurrences", x => x.Id);
                    table.ForeignKey(
                        name: "FK_workout_occurrences_assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalSchema: "training",
                        principalTable: "assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_workout_occurrences_revisions_RevisionId",
                        column: x => x.RevisionId,
                        principalSchema: "training",
                        principalTable: "revisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "workout_executions",
                schema: "training",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OccurrenceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    Prescription = table.Column<string>(type: "jsonb", nullable: false),
                    PerformedDate = table.Column<DateOnly>(type: "date", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    Comment = table.Column<string>(type: "text", nullable: false),
                    DurationSeconds = table.Column<int>(type: "integer", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workout_executions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_workout_executions_workout_occurrences_OccurrenceId",
                        column: x => x.OccurrenceId,
                        principalSchema: "training",
                        principalTable: "workout_occurrences",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "exercise_executions",
                schema: "training",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExecutionId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrescribedInstanceId = table.Column<Guid>(type: "uuid", nullable: true),
                    ExerciseId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsSubstitution = table.Column<bool>(type: "boolean", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Comment = table.Column<string>(type: "text", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exercise_executions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_exercise_executions_workout_executions_ExecutionId",
                        column: x => x.ExecutionId,
                        principalSchema: "training",
                        principalTable: "workout_executions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "set_executions",
                schema: "training",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExerciseExecutionId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrescribedSetId = table.Column<Guid>(type: "uuid", nullable: true),
                    PrescribedSegmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    Skipped = table.Column<bool>(type: "boolean", nullable: false),
                    Reps = table.Column<int>(type: "integer", nullable: true),
                    Load = table.Column<decimal>(type: "numeric", nullable: true),
                    LoadUnit = table.Column<string>(type: "text", nullable: true),
                    LoadMeaning = table.Column<string>(type: "text", nullable: false),
                    Rpe = table.Column<decimal>(type: "numeric", nullable: true),
                    Rir = table.Column<decimal>(type: "numeric", nullable: true),
                    DurationSeconds = table.Column<decimal>(type: "numeric", nullable: true),
                    DistanceMeters = table.Column<decimal>(type: "numeric", nullable: true),
                    RestSeconds = table.Column<decimal>(type: "numeric", nullable: true),
                    Tempo = table.Column<string>(type: "text", nullable: true),
                    Comment = table.Column<string>(type: "text", nullable: false),
                    VolumeKg = table.Column<decimal>(type: "numeric", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_set_executions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_set_executions_exercise_executions_ExerciseExecutionId",
                        column: x => x.ExerciseExecutionId,
                        principalSchema: "training",
                        principalTable: "exercise_executions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_assignment_batches_CoachId_IdempotencyKey",
                schema: "training",
                table: "assignment_batches",
                columns: new[] { "CoachId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_assignment_group_sources_GroupAssignmentId",
                schema: "training",
                table: "assignment_group_sources",
                column: "GroupAssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_assignments_BatchId_RelationshipId",
                schema: "training",
                table: "assignments",
                columns: new[] { "BatchId", "RelationshipId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_assignments_EffectiveRevisionId",
                schema: "training",
                table: "assignments",
                column: "EffectiveRevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_assignments_GroupAssignmentId",
                schema: "training",
                table: "assignments",
                column: "GroupAssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_assignments_OriginalRevisionId",
                schema: "training",
                table: "assignments",
                column: "OriginalRevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_assignments_ProgramId",
                schema: "training",
                table: "assignments",
                column: "ProgramId");

            migrationBuilder.CreateIndex(
                name: "IX_assignments_RelationshipId_Status_CreatedAt",
                schema: "training",
                table: "assignments",
                columns: new[] { "RelationshipId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_exercise_executions_ExecutionId",
                schema: "training",
                table: "exercise_executions",
                column: "ExecutionId");

            migrationBuilder.CreateIndex(
                name: "IX_exercise_executions_ExerciseId_ExecutionId",
                schema: "training",
                table: "exercise_executions",
                columns: new[] { "ExerciseId", "ExecutionId" });

            migrationBuilder.CreateIndex(
                name: "IX_group_assignments_BatchId_GroupId",
                schema: "training",
                table: "group_assignments",
                columns: new[] { "BatchId", "GroupId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_program_generations_WorkspaceId_OwnerId_IdempotencyKey",
                schema: "training",
                table: "program_generations",
                columns: new[] { "WorkspaceId", "OwnerId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_set_executions_ExerciseExecutionId",
                schema: "training",
                table: "set_executions",
                column: "ExerciseExecutionId");

            migrationBuilder.CreateIndex(
                name: "IX_workout_executions_OccurrenceId",
                schema: "training",
                table: "workout_executions",
                column: "OccurrenceId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_workout_executions_PerformedDate_Status",
                schema: "training",
                table: "workout_executions",
                columns: new[] { "PerformedDate", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_workout_occurrences_AssignmentId_RevisionId_WorkoutId",
                schema: "training",
                table: "workout_occurrences",
                columns: new[] { "AssignmentId", "RevisionId", "WorkoutId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_workout_occurrences_RevisionId",
                schema: "training",
                table: "workout_occurrences",
                column: "RevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_workout_occurrences_ScheduledDate_AssignmentId",
                schema: "training",
                table: "workout_occurrences",
                columns: new[] { "ScheduledDate", "AssignmentId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "assignment_group_sources",
                schema: "training");

            migrationBuilder.DropTable(
                name: "program_generations",
                schema: "training");

            migrationBuilder.DropTable(
                name: "set_executions",
                schema: "training");

            migrationBuilder.DropTable(
                name: "exercise_executions",
                schema: "training");

            migrationBuilder.DropTable(
                name: "workout_executions",
                schema: "training");

            migrationBuilder.DropTable(
                name: "workout_occurrences",
                schema: "training");

            migrationBuilder.DropTable(
                name: "assignments",
                schema: "training");

            migrationBuilder.DropTable(
                name: "group_assignments",
                schema: "training");

            migrationBuilder.DropTable(
                name: "assignment_batches",
                schema: "training");
        }
    }
}
