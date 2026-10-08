using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Calendar.Migrations
{
    /// <inheritdoc />
    public partial class InitialCalendar : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "calendar");

            migrationBuilder.CreateTable(
                name: "Events",
                schema: "calendar",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: false),
                    TimeZone = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    StartsAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EndsAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: true),
                    EndDateExclusive = table.Column<DateOnly>(type: "date", nullable: true),
                    Location = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    MeetingUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    Cancelled = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Events", x => x.Id);
                    table.UniqueConstraint("AK_Events_Id_CoachId_WorkspaceId", x => new { x.Id, x.CoachId, x.WorkspaceId });
                    table.CheckConstraint("CK_Event_Dates", "(\"StartDate\" IS NULL AND \"EndDateExclusive\" IS NULL) OR (\"Kind\" = 'Event' AND \"StartDate\" IS NOT NULL AND \"EndDateExclusive\" > \"StartDate\")");
                    table.CheckConstraint("CK_Event_Kind", "\"Kind\" IN ('Meeting','Event')");
                    table.CheckConstraint("CK_Event_Time", "\"EndsAtUtc\" > \"StartsAtUtc\"");
                });

            migrationBuilder.CreateTable(
                name: "Attendees",
                schema: "calendar",
                columns: table => new
                {
                    EventId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Response = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Attendees", x => new { x.EventId, x.ClientId });
                    table.CheckConstraint("CK_Attendee_Response", "\"Response\" IN ('Pending','Accepted','Declined')");
                    table.ForeignKey(
                        name: "FK_Attendees_Events_EventId_CoachId_WorkspaceId",
                        columns: x => new { x.EventId, x.CoachId, x.WorkspaceId },
                        principalSchema: "calendar",
                        principalTable: "Events",
                        principalColumns: new[] { "Id", "CoachId", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Audit",
                schema: "calendar",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    At = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Audit", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Audit_Events_EventId",
                        column: x => x.EventId,
                        principalSchema: "calendar",
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Attendees_ClientId_EventId",
                schema: "calendar",
                table: "Attendees",
                columns: new[] { "ClientId", "EventId" });

            migrationBuilder.CreateIndex(
                name: "IX_Attendees_EventId_CoachId_WorkspaceId",
                schema: "calendar",
                table: "Attendees",
                columns: new[] { "EventId", "CoachId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_Attendees_RelationshipId_CoachId_WorkspaceId",
                schema: "calendar",
                table: "Attendees",
                columns: new[] { "RelationshipId", "CoachId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_Audit_EventId_At",
                schema: "calendar",
                table: "Audit",
                columns: new[] { "EventId", "At" });

            migrationBuilder.CreateIndex(
                name: "IX_Events_CoachId_WorkspaceId_StartsAtUtc_Id",
                schema: "calendar",
                table: "Events",
                columns: new[] { "CoachId", "WorkspaceId", "StartsAtUtc", "Id" });
            migrationBuilder.Sql("""
                ALTER TABLE calendar."Attendees" ADD CONSTRAINT "FK_Attendee_Relationship" FOREIGN KEY ("RelationshipId", "CoachId", "WorkspaceId") REFERENCES coaching."Relationships" ("Id", "CoachId", "WorkspaceId");
                CREATE FUNCTION calendar.reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Calendar audit is immutable'; END $$;
                CREATE TRIGGER calendar_audit_immutable BEFORE UPDATE OR DELETE ON calendar."Audit" FOR EACH ROW EXECUTE FUNCTION calendar.reject_audit_mutation();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER calendar_audit_immutable ON calendar.\"Audit\"; DROP FUNCTION calendar.reject_audit_mutation();");
            migrationBuilder.DropTable(
                name: "Attendees",
                schema: "calendar");

            migrationBuilder.DropTable(
                name: "Audit",
                schema: "calendar");

            migrationBuilder.DropTable(
                name: "Events",
                schema: "calendar");
        }
    }
}
