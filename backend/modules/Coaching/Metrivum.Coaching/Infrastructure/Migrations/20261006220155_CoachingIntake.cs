using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Coaching.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CoachingIntake : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Invitations",
                schema: "coaching",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    OfferSnapshot = table.Column<string>(type: "jsonb", nullable: false),
                    BillingOptionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Message = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RespondedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Invitations", x => x.Id);
                    table.UniqueConstraint("AK_Invitations_Id_CoachId_WorkspaceId_TargetUserId", x => new { x.Id, x.CoachId, x.WorkspaceId, x.TargetUserId });
                    table.CheckConstraint("CK_Invitation_NoSelf", "\"CoachId\" <> \"TargetUserId\"");
                    table.CheckConstraint("CK_Invitation_Status", "\"Status\" IN ('Pending','Accepted','Declined','Revoked')");
                });

            migrationBuilder.CreateTable(
                name: "Applications",
                schema: "coaching",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicantUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferId = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    OfferSnapshot = table.Column<string>(type: "jsonb", nullable: false),
                    BillingOptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SelectedSessionCount = table.Column<int>(type: "integer", nullable: true),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    Source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    InvitationId = table.Column<Guid>(type: "uuid", nullable: true),
                    FormVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    FormSubmissionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Answers = table.Column<string>(type: "jsonb", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SubmittedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DecidedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Applications", x => x.Id);
                    table.UniqueConstraint("AK_Applications_Id_CoachId_WorkspaceId_ApplicantUserId", x => new { x.Id, x.CoachId, x.WorkspaceId, x.ApplicantUserId });
                    table.CheckConstraint("CK_Application_NoSelf", "\"CoachId\" <> \"ApplicantUserId\"");
                    table.CheckConstraint("CK_Application_Source", "(\"Source\" = 'Direct' AND \"InvitationId\" IS NULL) OR (\"Source\" = 'Invitation' AND \"InvitationId\" IS NOT NULL)");
                    table.CheckConstraint("CK_Application_Status", "\"Status\" IN ('InProgress','Submitted','Accepted','Rejected','Withdrawn')");
                    table.CheckConstraint("CK_Application_Submission", "\"Status\" NOT IN ('Submitted','Accepted','Rejected') OR (\"SubmittedAt\" IS NOT NULL AND \"FormSubmissionId\" IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_Applications_Invitations_InvitationId_CoachId_WorkspaceId_A~",
                        columns: x => new { x.InvitationId, x.CoachId, x.WorkspaceId, x.ApplicantUserId },
                        principalSchema: "coaching",
                        principalTable: "Invitations",
                        principalColumns: new[] { "Id", "CoachId", "WorkspaceId", "TargetUserId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ApplicationChanges",
                schema: "coaching",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    PreviousStatus = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    NewStatus = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    InternalReason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApplicationChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ApplicationChanges_Applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalSchema: "coaching",
                        principalTable: "Applications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Services",
                schema: "coaching",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    OfferSnapshot = table.Column<string>(type: "jsonb", nullable: false),
                    BillingOptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SelectedSessionCount = table.Column<int>(type: "integer", nullable: true),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Services", x => x.Id);
                    table.CheckConstraint("CK_Service_Status", "\"Status\" IN ('Active','Completed')");
                    table.ForeignKey(
                        name: "FK_Services_Applications_ApplicationId_CoachId_WorkspaceId_Cli~",
                        columns: x => new { x.ApplicationId, x.CoachId, x.WorkspaceId, x.ClientId },
                        principalSchema: "coaching",
                        principalTable: "Applications",
                        principalColumns: new[] { "Id", "CoachId", "WorkspaceId", "ApplicantUserId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Services_Relationships_RelationshipId_CoachId_WorkspaceId",
                        columns: x => new { x.RelationshipId, x.CoachId, x.WorkspaceId },
                        principalSchema: "coaching",
                        principalTable: "Relationships",
                        principalColumns: new[] { "Id", "CoachId", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ApplicationChanges_ApplicationId_Version",
                schema: "coaching",
                table: "ApplicationChanges",
                columns: new[] { "ApplicationId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Applications_ApplicantUserId_Status_UpdatedAt_Id",
                schema: "coaching",
                table: "Applications",
                columns: new[] { "ApplicantUserId", "Status", "UpdatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Applications_CoachId_Status_UpdatedAt_Id",
                schema: "coaching",
                table: "Applications",
                columns: new[] { "CoachId", "Status", "UpdatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Applications_InvitationId",
                schema: "coaching",
                table: "Applications",
                column: "InvitationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Applications_InvitationId_CoachId_WorkspaceId_ApplicantUser~",
                schema: "coaching",
                table: "Applications",
                columns: new[] { "InvitationId", "CoachId", "WorkspaceId", "ApplicantUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_Invitations_CoachId_Status_CreatedAt_Id",
                schema: "coaching",
                table: "Invitations",
                columns: new[] { "CoachId", "Status", "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Invitations_TargetUserId_Status_CreatedAt_Id",
                schema: "coaching",
                table: "Invitations",
                columns: new[] { "TargetUserId", "Status", "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Services_ApplicationId",
                schema: "coaching",
                table: "Services",
                column: "ApplicationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Services_ApplicationId_CoachId_WorkspaceId_ClientId",
                schema: "coaching",
                table: "Services",
                columns: new[] { "ApplicationId", "CoachId", "WorkspaceId", "ClientId" });

            migrationBuilder.CreateIndex(
                name: "IX_Services_OrderId",
                schema: "coaching",
                table: "Services",
                column: "OrderId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Services_RelationshipId_CoachId_WorkspaceId",
                schema: "coaching",
                table: "Services",
                columns: new[] { "RelationshipId", "CoachId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_Services_RelationshipId_Status_StartedAt_Id",
                schema: "coaching",
                table: "Services",
                columns: new[] { "RelationshipId", "Status", "StartedAt", "Id" });

            migrationBuilder.Sql("""
                CREATE TRIGGER application_changes_immutable BEFORE UPDATE OR DELETE ON coaching."ApplicationChanges"
                  FOR EACH ROW EXECUTE FUNCTION coaching.reject_audit_change();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ApplicationChanges",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "Services",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "Applications",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "Invitations",
                schema: "coaching");
        }
    }
}
