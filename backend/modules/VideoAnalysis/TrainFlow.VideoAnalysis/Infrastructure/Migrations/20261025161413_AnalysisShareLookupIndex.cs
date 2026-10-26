using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.VideoAnalysis.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AnalysisShareLookupIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_analysis_shares_AnalysisId_RevokedAt",
                schema: "video_analysis",
                table: "analysis_shares",
                columns: new[] { "AnalysisId", "RevokedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_analysis_shares_AnalysisId_RevokedAt",
                schema: "video_analysis",
                table: "analysis_shares");
        }
    }
}
