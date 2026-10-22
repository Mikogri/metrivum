using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Integrations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ConnectedAiIntegrations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "integrations");

            migrationBuilder.CreateTable(
                name: "Connections",
                schema: "integrations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ClientName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    AuthorizationId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Grants = table.Column<string[]>(type: "text[]", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    TokenNotBefore = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastUsedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevokedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Connections", x => x.Id);
                    table.UniqueConstraint("AK_Connections_Id_UserId", x => new { x.Id, x.UserId });
                    table.CheckConstraint("CK_Connection_Version", "\"Version\" > 0");
                });

            migrationBuilder.CreateTable(
                name: "ProgrammingPreferences",
                schema: "integrations",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Note = table.Column<string>(type: "character varying(8000)", maxLength: 8000, nullable: false),
                    ShareWithIntegrations = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProgrammingPreferences", x => x.UserId);
                });

            migrationBuilder.CreateTable(
                name: "CommandReceipts",
                schema: "integrations",
                columns: table => new
                {
                    ConnectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Tool = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IdempotencyKey = table.Column<Guid>(type: "uuid", nullable: false),
                    PayloadHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ResultJson = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommandReceipts", x => new { x.ConnectionId, x.Tool, x.IdempotencyKey });
                    table.ForeignKey(
                        name: "FK_CommandReceipts_Connections_ConnectionId",
                        column: x => x.ConnectionId,
                        principalSchema: "integrations",
                        principalTable: "Connections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PendingActions",
                schema: "integrations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConnectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    PayloadJson = table.Column<string>(type: "jsonb", nullable: false),
                    PayloadHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpectedRevision = table.Column<long>(type: "bigint", nullable: false),
                    ConnectionVersion = table.Column<long>(type: "bigint", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    IdempotencyKey = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ApprovedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ApprovedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    ExecutedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    MessageId = table.Column<Guid>(type: "uuid", nullable: true),
                    CorrelationId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PendingActions", x => x.Id);
                    table.CheckConstraint("CK_Action_Approval", "(\"Status\" NOT IN ('Approved','Executed')) OR (\"ApprovedAt\" IS NOT NULL AND \"ApprovedBy\" = \"UserId\")");
                    table.CheckConstraint("CK_Action_Execution", "(\"Status\" <> 'Executed') OR (\"ExecutedAt\" IS NOT NULL AND \"MessageId\" IS NOT NULL)");
                    table.CheckConstraint("CK_Action_Expiry", "\"ExpiresAt\" > \"CreatedAt\"");
                    table.CheckConstraint("CK_Action_Status", "\"Status\" IN ('Pending','Approved','Executed','Rejected','Expired')");
                    table.CheckConstraint("CK_Action_Type", "\"Type\" = 'SendMessage'");
                    table.ForeignKey(
                        name: "FK_PendingActions_Connections_ConnectionId_UserId",
                        columns: x => new { x.ConnectionId, x.UserId },
                        principalSchema: "integrations",
                        principalTable: "Connections",
                        principalColumns: new[] { "Id", "UserId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Connections_UserId_ClientId",
                schema: "integrations",
                table: "Connections",
                columns: new[] { "UserId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PendingActions_ConnectionId_IdempotencyKey",
                schema: "integrations",
                table: "PendingActions",
                columns: new[] { "ConnectionId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PendingActions_ConnectionId_UserId",
                schema: "integrations",
                table: "PendingActions",
                columns: new[] { "ConnectionId", "UserId" });

            migrationBuilder.CreateIndex(
                name: "IX_PendingActions_UserId_Status_CreatedAt",
                schema: "integrations",
                table: "PendingActions",
                columns: new[] { "UserId", "Status", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CommandReceipts",
                schema: "integrations");

            migrationBuilder.DropTable(
                name: "PendingActions",
                schema: "integrations");

            migrationBuilder.DropTable(
                name: "ProgrammingPreferences",
                schema: "integrations");

            migrationBuilder.DropTable(
                name: "Connections",
                schema: "integrations");
        }
    }
}
