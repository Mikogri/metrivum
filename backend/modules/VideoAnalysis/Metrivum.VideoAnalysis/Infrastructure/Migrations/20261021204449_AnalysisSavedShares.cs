using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.VideoAnalysis.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AnalysisSavedShares : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AllowSave",
                schema: "video_analysis",
                table: "analysis_shares",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "saved_shares",
                schema: "video_analysis",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ShareId = table.Column<Guid>(type: "uuid", nullable: false),
                    AnalysisId = table.Column<Guid>(type: "uuid", nullable: false),
                    SavedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_saved_shares", x => x.Id);
                    table.ForeignKey(
                        name: "FK_saved_shares_analysis_shares_ShareId",
                        column: x => x.ShareId,
                        principalSchema: "video_analysis",
                        principalTable: "analysis_shares",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_saved_shares_jobs_AnalysisId",
                        column: x => x.AnalysisId,
                        principalSchema: "video_analysis",
                        principalTable: "jobs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_saved_shares_AnalysisId",
                schema: "video_analysis",
                table: "saved_shares",
                column: "AnalysisId");

            migrationBuilder.CreateIndex(
                name: "IX_saved_shares_ShareId",
                schema: "video_analysis",
                table: "saved_shares",
                column: "ShareId");

            migrationBuilder.CreateIndex(
                name: "IX_saved_shares_UserId_AnalysisId",
                schema: "video_analysis",
                table: "saved_shares",
                columns: new[] { "UserId", "AnalysisId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_saved_shares_UserId_SavedAt",
                schema: "video_analysis",
                table: "saved_shares",
                columns: new[] { "UserId", "SavedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "saved_shares",
                schema: "video_analysis");

            migrationBuilder.DropColumn(
                name: "AllowSave",
                schema: "video_analysis",
                table: "analysis_shares");
        }
    }
}
