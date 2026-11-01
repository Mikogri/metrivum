using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Coaching.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DiscoveryPublicationHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DiscoveryPublicationChanges",
                schema: "coaching",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    PreviousPublished = table.Column<bool>(type: "boolean", nullable: false),
                    Published = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    ChangedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiscoveryPublicationChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DiscoveryPublicationChanges_DiscoveryProfiles_CoachId",
                        column: x => x.CoachId,
                        principalSchema: "coaching",
                        principalTable: "DiscoveryProfiles",
                        principalColumn: "CoachId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DiscoveryPublicationChanges_CoachId_Version",
                schema: "coaching",
                table: "DiscoveryPublicationChanges",
                columns: new[] { "CoachId", "Version" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DiscoveryPublicationChanges",
                schema: "coaching");
        }
    }
}
