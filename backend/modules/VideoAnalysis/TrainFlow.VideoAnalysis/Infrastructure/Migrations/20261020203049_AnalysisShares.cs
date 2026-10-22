using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.VideoAnalysis.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AnalysisShares : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "analysis_shares",
                schema: "video_analysis",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AnalysisId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Token = table.Column<string>(type: "character varying(43)", maxLength: 43, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RevokedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_analysis_shares", x => x.Id);
                    table.CheckConstraint("ck_share_token", "char_length(\"Token\") = 43");
                    table.ForeignKey(
                        name: "FK_analysis_shares_jobs_AnalysisId",
                        column: x => x.AnalysisId,
                        principalSchema: "video_analysis",
                        principalTable: "jobs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_analysis_shares_AnalysisId",
                schema: "video_analysis",
                table: "analysis_shares",
                column: "AnalysisId",
                unique: true,
                filter: "\"RevokedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_analysis_shares_Token",
                schema: "video_analysis",
                table: "analysis_shares",
                column: "Token",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "analysis_shares",
                schema: "video_analysis");
        }
    }
}
