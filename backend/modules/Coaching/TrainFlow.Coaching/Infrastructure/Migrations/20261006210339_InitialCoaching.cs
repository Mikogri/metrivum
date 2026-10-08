using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Coaching.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCoaching : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "coaching");

            migrationBuilder.CreateTable(
                name: "Groups",
                schema: "coaching",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    Color = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    Archived = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Groups", x => x.Id);
                    table.UniqueConstraint("AK_Groups_Id_CoachId_WorkspaceId", x => new { x.Id, x.CoachId, x.WorkspaceId });
                    table.CheckConstraint("CK_Group_Color", "\"Color\" ~ '^#[0-9A-Fa-f]{6}$'");
                    table.CheckConstraint("CK_Group_Name", "length(btrim(\"Name\")) BETWEEN 1 AND 200");
                });

            migrationBuilder.CreateTable(
                name: "Relationships",
                schema: "coaching",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ActivationSource = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    SuspendedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ResumedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Relationships", x => x.Id);
                    table.UniqueConstraint("AK_Relationships_Id_CoachId_WorkspaceId", x => new { x.Id, x.CoachId, x.WorkspaceId });
                    table.CheckConstraint("CK_Relationship_NoSelf", "\"CoachId\" <> \"ClientId\"");
                    table.CheckConstraint("CK_Relationship_Source", "\"ActivationSource\" IN ('DevFixture','AcceptedApplication')");
                    table.CheckConstraint("CK_Relationship_Status", "\"Status\" IN ('Active','Suspended','Completed')");
                });

            migrationBuilder.CreateTable(
                name: "MembershipChanges",
                schema: "coaching",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GroupId = table.Column<Guid>(type: "uuid", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Added = table.Column<bool>(type: "boolean", nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MembershipChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MembershipChanges_Groups_GroupId",
                        column: x => x.GroupId,
                        principalSchema: "coaching",
                        principalTable: "Groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MembershipChanges_Relationships_RelationshipId",
                        column: x => x.RelationshipId,
                        principalSchema: "coaching",
                        principalTable: "Relationships",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Memberships",
                schema: "coaching",
                columns: table => new
                {
                    GroupId = table.Column<Guid>(type: "uuid", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Memberships", x => new { x.GroupId, x.RelationshipId });
                    table.ForeignKey(
                        name: "FK_Memberships_Groups_GroupId_CoachId_WorkspaceId",
                        columns: x => new { x.GroupId, x.CoachId, x.WorkspaceId },
                        principalSchema: "coaching",
                        principalTable: "Groups",
                        principalColumns: new[] { "Id", "CoachId", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Memberships_Relationships_RelationshipId_CoachId_WorkspaceId",
                        columns: x => new { x.RelationshipId, x.CoachId, x.WorkspaceId },
                        principalSchema: "coaching",
                        principalTable: "Relationships",
                        principalColumns: new[] { "Id", "CoachId", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StatusChanges",
                schema: "coaching",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    PreviousStatus = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    NewStatus = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    InternalReason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StatusChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StatusChanges_Relationships_RelationshipId",
                        column: x => x.RelationshipId,
                        principalSchema: "coaching",
                        principalTable: "Relationships",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Groups_CoachId_Archived_Name_Id",
                schema: "coaching",
                table: "Groups",
                columns: new[] { "CoachId", "Archived", "Name", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_MembershipChanges_GroupId_Version",
                schema: "coaching",
                table: "MembershipChanges",
                columns: new[] { "GroupId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MembershipChanges_RelationshipId",
                schema: "coaching",
                table: "MembershipChanges",
                column: "RelationshipId");

            migrationBuilder.CreateIndex(
                name: "IX_Memberships_GroupId_CoachId_WorkspaceId",
                schema: "coaching",
                table: "Memberships",
                columns: new[] { "GroupId", "CoachId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_Memberships_RelationshipId_CoachId_WorkspaceId",
                schema: "coaching",
                table: "Memberships",
                columns: new[] { "RelationshipId", "CoachId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_Memberships_RelationshipId_GroupId",
                schema: "coaching",
                table: "Memberships",
                columns: new[] { "RelationshipId", "GroupId" });

            migrationBuilder.CreateIndex(
                name: "IX_Relationships_ClientId_Status_Id",
                schema: "coaching",
                table: "Relationships",
                columns: new[] { "ClientId", "Status", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Relationships_CoachId_ClientId",
                schema: "coaching",
                table: "Relationships",
                columns: new[] { "CoachId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Relationships_CoachId_Status_UpdatedAt_Id",
                schema: "coaching",
                table: "Relationships",
                columns: new[] { "CoachId", "Status", "UpdatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_StatusChanges_RelationshipId_Version",
                schema: "coaching",
                table: "StatusChanges",
                columns: new[] { "RelationshipId", "Version" },
                unique: true);

            migrationBuilder.Sql("""
                CREATE FUNCTION coaching.reject_audit_change() RETURNS trigger
                LANGUAGE plpgsql SET search_path = pg_catalog AS $$
                BEGIN
                  RAISE EXCEPTION 'Coaching audit records are immutable' USING ERRCODE = '23000';
                END;
                $$;
                CREATE TRIGGER status_changes_immutable BEFORE UPDATE OR DELETE ON coaching."StatusChanges"
                  FOR EACH ROW EXECUTE FUNCTION coaching.reject_audit_change();
                CREATE TRIGGER membership_changes_immutable BEFORE UPDATE OR DELETE ON coaching."MembershipChanges"
                  FOR EACH ROW EXECUTE FUNCTION coaching.reject_audit_change();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MembershipChanges",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "Memberships",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "StatusChanges",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "Groups",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "Relationships",
                schema: "coaching");

            migrationBuilder.Sql("DROP FUNCTION coaching.reject_audit_change();");
        }
    }
}
