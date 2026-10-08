using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.CheckIns.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCheckIns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "checkins");

            migrationBuilder.CreateTable(
                name: "Schedules",
                schema: "checkins",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    FormTemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    TimeZone = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RecurrenceJson = table.Column<string>(type: "jsonb", nullable: false),
                    ResponseWindowHours = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    NextAvailableAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RetryAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastFailure = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    FailureCount = table.Column<int>(type: "integer", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Schedules", x => x.Id);
                    table.UniqueConstraint("AK_Schedules_Id_CoachId_WorkspaceId", x => new { x.Id, x.CoachId, x.WorkspaceId });
                    table.CheckConstraint("CK_Schedule_Name", "length(btrim(\"Name\")) BETWEEN 1 AND 200");
                    table.CheckConstraint("CK_Schedule_Status", "\"Status\" IN ('Active','Paused','Ended')");
                    table.CheckConstraint("CK_Schedule_Window", "\"ResponseWindowHours\" BETWEEN 1 AND 8760");
                });

            migrationBuilder.CreateTable(
                name: "Requests",
                schema: "checkins",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ScheduleId = table.Column<Guid>(type: "uuid", nullable: false),
                    ScheduleName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    FormVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    AvailableAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DueAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    FormSubmissionId = table.Column<Guid>(type: "uuid", nullable: true),
                    SubmittedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    WasLate = table.Column<bool>(type: "boolean", nullable: false),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ReviewedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    ClientReply = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    CoachPrivateNotes = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    CancelledAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CancelledBy = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Requests", x => x.Id);
                    table.CheckConstraint("CK_Request_Cancel", "(\"Status\" = 'Cancelled') = (\"CancelledAt\" IS NOT NULL AND \"CancelledBy\" IS NOT NULL)");
                    table.CheckConstraint("CK_Request_Dates", "\"DueAtUtc\" > \"AvailableAtUtc\"");
                    table.CheckConstraint("CK_Request_Review", "(\"Status\" = 'Reviewed') = (\"ReviewedAt\" IS NOT NULL AND \"ReviewedBy\" IS NOT NULL)");
                    table.CheckConstraint("CK_Request_Status", "\"Status\" IN ('Scheduled','Submitted','Reviewed','Cancelled')");
                    table.CheckConstraint("CK_Request_Submission", "(\"Status\" IN ('Submitted','Reviewed')) = (\"FormSubmissionId\" IS NOT NULL AND \"SubmittedAt\" IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_Requests_Schedules_ScheduleId_CoachId_WorkspaceId",
                        columns: x => new { x.ScheduleId, x.CoachId, x.WorkspaceId },
                        principalSchema: "checkins",
                        principalTable: "Schedules",
                        principalColumns: new[] { "Id", "CoachId", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Targets",
                schema: "checkins",
                columns: table => new
                {
                    ScheduleId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsGroup = table.Column<bool>(type: "boolean", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: true, computedColumnSql: "CASE WHEN NOT \"IsGroup\" THEN \"TargetId\" ELSE NULL END", stored: true),
                    GroupId = table.Column<Guid>(type: "uuid", nullable: true, computedColumnSql: "CASE WHEN \"IsGroup\" THEN \"TargetId\" ELSE NULL END", stored: true),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Targets", x => new { x.ScheduleId, x.TargetId, x.IsGroup });
                    table.ForeignKey(
                        name: "FK_Targets_Schedules_ScheduleId_CoachId_WorkspaceId",
                        columns: x => new { x.ScheduleId, x.CoachId, x.WorkspaceId },
                        principalSchema: "checkins",
                        principalTable: "Schedules",
                        principalColumns: new[] { "Id", "CoachId", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Requests_ClientId_Status_DueAtUtc_Id",
                schema: "checkins",
                table: "Requests",
                columns: new[] { "ClientId", "Status", "DueAtUtc", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Requests_CoachId_WorkspaceId_Status_DueAtUtc_Id",
                schema: "checkins",
                table: "Requests",
                columns: new[] { "CoachId", "WorkspaceId", "Status", "DueAtUtc", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Requests_FormSubmissionId",
                schema: "checkins",
                table: "Requests",
                column: "FormSubmissionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Requests_RelationshipId_DueAtUtc_Id",
                schema: "checkins",
                table: "Requests",
                columns: new[] { "RelationshipId", "DueAtUtc", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Requests_ScheduleId_AvailableAtUtc_RelationshipId",
                schema: "checkins",
                table: "Requests",
                columns: new[] { "ScheduleId", "AvailableAtUtc", "RelationshipId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Requests_ScheduleId_CoachId_WorkspaceId",
                schema: "checkins",
                table: "Requests",
                columns: new[] { "ScheduleId", "CoachId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_Schedules_CoachId_WorkspaceId_Status_UpdatedAt_Id",
                schema: "checkins",
                table: "Schedules",
                columns: new[] { "CoachId", "WorkspaceId", "Status", "UpdatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Schedules_Status_NextAvailableAtUtc_RetryAtUtc",
                schema: "checkins",
                table: "Schedules",
                columns: new[] { "Status", "NextAvailableAtUtc", "RetryAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Targets_ScheduleId_CoachId_WorkspaceId",
                schema: "checkins",
                table: "Targets",
                columns: new[] { "ScheduleId", "CoachId", "WorkspaceId" });
            migrationBuilder.Sql("""
                ALTER TABLE checkins."Targets" ADD CONSTRAINT "FK_Targets_Coaching_Relationship"
                  FOREIGN KEY ("RelationshipId", "CoachId", "WorkspaceId") REFERENCES coaching."Relationships" ("Id", "CoachId", "WorkspaceId") ON DELETE RESTRICT;
                ALTER TABLE checkins."Targets" ADD CONSTRAINT "FK_Targets_Coaching_Group"
                  FOREIGN KEY ("GroupId", "CoachId", "WorkspaceId") REFERENCES coaching."Groups" ("Id", "CoachId", "WorkspaceId") ON DELETE RESTRICT;
                ALTER TABLE checkins."Requests" ADD CONSTRAINT "FK_Requests_Coaching_Relationship"
                  FOREIGN KEY ("RelationshipId", "CoachId", "WorkspaceId") REFERENCES coaching."Relationships" ("Id", "CoachId", "WorkspaceId") ON DELETE RESTRICT;
                ALTER TABLE checkins."Schedules" ADD CONSTRAINT "FK_Schedules_FormTemplate"
                  FOREIGN KEY ("FormTemplateId") REFERENCES forms.templates ("Id") ON DELETE RESTRICT;
                ALTER TABLE checkins."Requests" ADD CONSTRAINT "FK_Requests_FormVersion"
                  FOREIGN KEY ("FormVersionId") REFERENCES forms.versions ("Id") ON DELETE RESTRICT;
                ALTER TABLE checkins."Requests" ADD CONSTRAINT "FK_Requests_FormSubmission"
                  FOREIGN KEY ("FormSubmissionId") REFERENCES forms.submissions ("Id") ON DELETE RESTRICT;
                CREATE FUNCTION checkins.protect_request_history() RETURNS trigger
                LANGUAGE plpgsql SET search_path = pg_catalog AS $$
                BEGIN
                  IF TG_OP = 'DELETE' THEN
                    RAISE EXCEPTION 'Issued check-in history cannot be deleted' USING ERRCODE = '23514';
                  END IF;
                  IF ROW(NEW."ScheduleId", NEW."RelationshipId", NEW."CoachId", NEW."WorkspaceId", NEW."ClientId", NEW."FormVersionId", NEW."AvailableAtUtc", NEW."DueAtUtc", NEW."ScheduleName")
                    IS DISTINCT FROM ROW(OLD."ScheduleId", OLD."RelationshipId", OLD."CoachId", OLD."WorkspaceId", OLD."ClientId", OLD."FormVersionId", OLD."AvailableAtUtc", OLD."DueAtUtc", OLD."ScheduleName") THEN
                    RAISE EXCEPTION 'Issued check-in definitions are immutable' USING ERRCODE = '23514';
                  END IF;
                  IF OLD."FormSubmissionId" IS NOT NULL AND ROW(NEW."FormSubmissionId", NEW."SubmittedAt", NEW."WasLate")
                    IS DISTINCT FROM ROW(OLD."FormSubmissionId", OLD."SubmittedAt", OLD."WasLate") THEN
                    RAISE EXCEPTION 'Submitted check-in answers are immutable' USING ERRCODE = '23514';
                  END IF;
                  IF OLD."Status" IN ('Reviewed','Cancelled') AND NEW IS DISTINCT FROM OLD THEN
                    RAISE EXCEPTION 'Reviewed and cancelled check-ins are immutable' USING ERRCODE = '23514';
                  END IF;
                  RETURN NEW;
                END $$;
                REVOKE ALL ON FUNCTION checkins.protect_request_history() FROM PUBLIC;
                CREATE TRIGGER protect_request_history BEFORE UPDATE OR DELETE ON checkins."Requests"
                  FOR EACH ROW EXECUTE FUNCTION checkins.protect_request_history();
                REVOKE ALL ON SCHEMA checkins FROM PUBLIC;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Requests",
                schema: "checkins");

            migrationBuilder.DropTable(
                name: "Targets",
                schema: "checkins");

            migrationBuilder.DropTable(
                name: "Schedules",
                schema: "checkins");
            migrationBuilder.Sql("DROP FUNCTION checkins.protect_request_history();");
        }
    }
}
