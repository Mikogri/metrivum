using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TeamsAndCheckout : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CheckoutTeamName",
                schema: "billing",
                table: "platform_subscriptions",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "teams",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_teams", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "team_memberships",
                schema: "billing",
                columns: table => new
                {
                    TeamId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    JoinedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_team_memberships", x => new { x.TeamId, x.UserId });
                    table.ForeignKey(
                        name: "FK_team_memberships_teams_TeamId",
                        column: x => x.TeamId,
                        principalSchema: "billing",
                        principalTable: "teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "team_requests",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_team_requests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_team_requests_teams_TeamId",
                        column: x => x.TeamId,
                        principalSchema: "billing",
                        principalTable: "teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                schema: "billing",
                table: "platform_plans",
                columns: new[] { "Id", "CommissionRate", "Name" },
                values: new object[] { "Team", 0.05m, "Team" });

            migrationBuilder.CreateIndex(
                name: "IX_team_requests_TeamId_UserId_Kind",
                schema: "billing",
                table: "team_requests",
                columns: new[] { "TeamId", "UserId", "Kind" },
                unique: true,
                filter: "\"Status\" = 'Pending'");

            migrationBuilder.CreateIndex(
                name: "IX_teams_OwnerId",
                schema: "billing",
                table: "teams",
                column: "OwnerId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "team_memberships",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "team_requests",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "teams",
                schema: "billing");

            migrationBuilder.DeleteData(
                schema: "billing",
                table: "platform_plans",
                keyColumn: "Id",
                keyValue: "Team");

            migrationBuilder.DropColumn(
                name: "CheckoutTeamName",
                schema: "billing",
                table: "platform_subscriptions");
        }
    }
}
