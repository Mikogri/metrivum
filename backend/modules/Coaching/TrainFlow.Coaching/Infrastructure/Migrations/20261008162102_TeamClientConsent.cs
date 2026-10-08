using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Coaching.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TeamClientConsent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TeamClientCases",
                schema: "coaching",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamClientCases", x => x.Id);
                    table.UniqueConstraint("AK_TeamClientCases_Id_TeamId", x => new { x.Id, x.TeamId });
                    table.CheckConstraint("CK_TeamCase_Status", "\"Status\" IN ('Active','Ended')");
                });

            migrationBuilder.CreateTable(
                name: "ClientTransferRequests",
                schema: "coaching",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamId = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProposedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ConsentVersion = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    ConsentText = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DecidedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DecidedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    TeamClientCaseId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourceRelationshipVersion = table.Column<long>(type: "bigint", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClientTransferRequests", x => x.Id);
                    table.CheckConstraint("CK_TeamTransfer_Consent", "\"Status\" <> 'Accepted' OR (\"TeamClientCaseId\" IS NOT NULL AND \"DecidedBy\" = \"ClientId\" AND \"DecidedAt\" IS NOT NULL)");
                    table.CheckConstraint("CK_TeamTransfer_Status", "\"Status\" IN ('Pending','Accepted','Declined','Expired','Revoked')");
                    table.ForeignKey(
                        name: "FK_ClientTransferRequests_Relationships_RelationshipId",
                        column: x => x.RelationshipId,
                        principalSchema: "coaching",
                        principalTable: "Relationships",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ClientTransferRequests_TeamClientCases_TeamClientCaseId_Tea~",
                        columns: x => new { x.TeamClientCaseId, x.TeamId },
                        principalSchema: "coaching",
                        principalTable: "TeamClientCases",
                        principalColumns: new[] { "Id", "TeamId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeamCaseChanges",
                schema: "coaching",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamClientCaseId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: true),
                    Kind = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamCaseChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TeamCaseChanges_TeamClientCases_TeamClientCaseId",
                        column: x => x.TeamClientCaseId,
                        principalSchema: "coaching",
                        principalTable: "TeamClientCases",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeamCoachAssignments",
                schema: "coaching",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamClientCaseId = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    AssignedBy = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamCoachAssignments", x => x.Id);
                    table.CheckConstraint("CK_TeamAssignment_Dates", "\"EndedAt\" IS NULL OR \"EndedAt\" >= \"StartedAt\"");
                    table.ForeignKey(
                        name: "FK_TeamCoachAssignments_TeamClientCases_TeamClientCaseId_TeamId",
                        columns: x => new { x.TeamClientCaseId, x.TeamId },
                        principalSchema: "coaching",
                        principalTable: "TeamClientCases",
                        principalColumns: new[] { "Id", "TeamId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeamTransferChanges",
                schema: "coaching",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TransferRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamTransferChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TeamTransferChanges_ClientTransferRequests_TransferRequestId",
                        column: x => x.TransferRequestId,
                        principalSchema: "coaching",
                        principalTable: "ClientTransferRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ClientTransferRequests_ClientId_Status_CreatedAt",
                schema: "coaching",
                table: "ClientTransferRequests",
                columns: new[] { "ClientId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ClientTransferRequests_RelationshipId",
                schema: "coaching",
                table: "ClientTransferRequests",
                column: "RelationshipId",
                unique: true,
                filter: "\"Status\" = 'Pending'");

            migrationBuilder.CreateIndex(
                name: "IX_ClientTransferRequests_TeamClientCaseId_TeamId",
                schema: "coaching",
                table: "ClientTransferRequests",
                columns: new[] { "TeamClientCaseId", "TeamId" });

            migrationBuilder.CreateIndex(
                name: "IX_ClientTransferRequests_TeamId_Status_CreatedAt",
                schema: "coaching",
                table: "ClientTransferRequests",
                columns: new[] { "TeamId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TeamCaseChanges_TeamClientCaseId_Version",
                schema: "coaching",
                table: "TeamCaseChanges",
                columns: new[] { "TeamClientCaseId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeamClientCases_TeamId_ClientId",
                schema: "coaching",
                table: "TeamClientCases",
                columns: new[] { "TeamId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeamClientCases_TeamId_Status_CreatedAt",
                schema: "coaching",
                table: "TeamClientCases",
                columns: new[] { "TeamId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TeamCoachAssignments_TeamClientCaseId_CoachId",
                schema: "coaching",
                table: "TeamCoachAssignments",
                columns: new[] { "TeamClientCaseId", "CoachId" },
                unique: true,
                filter: "\"EndedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_TeamCoachAssignments_TeamClientCaseId_TeamId",
                schema: "coaching",
                table: "TeamCoachAssignments",
                columns: new[] { "TeamClientCaseId", "TeamId" });

            migrationBuilder.CreateIndex(
                name: "IX_TeamCoachAssignments_TeamId_CoachId_EndedAt",
                schema: "coaching",
                table: "TeamCoachAssignments",
                columns: new[] { "TeamId", "CoachId", "EndedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TeamTransferChanges_TransferRequestId_Version",
                schema: "coaching",
                table: "TeamTransferChanges",
                columns: new[] { "TransferRequestId", "Version" },
                unique: true);
            migrationBuilder.Sql("""
                CREATE TRIGGER team_case_changes_immutable BEFORE UPDATE OR DELETE ON coaching."TeamCaseChanges"
                    FOR EACH ROW EXECUTE FUNCTION coaching.reject_audit_change();
                CREATE TRIGGER team_transfer_changes_immutable BEFORE UPDATE OR DELETE ON coaching."TeamTransferChanges"
                    FOR EACH ROW EXECUTE FUNCTION coaching.reject_audit_change();
                DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trainflow_api') THEN
                        GRANT SELECT, INSERT, UPDATE ON coaching."TeamClientCases", coaching."TeamCoachAssignments", coaching."ClientTransferRequests" TO trainflow_api;
                        GRANT SELECT, INSERT ON coaching."TeamCaseChanges", coaching."TeamTransferChanges" TO trainflow_api;
                    END IF;
                END $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TeamCaseChanges",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "TeamCoachAssignments",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "TeamTransferChanges",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "ClientTransferRequests",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "TeamClientCases",
                schema: "coaching");
        }
    }
}
