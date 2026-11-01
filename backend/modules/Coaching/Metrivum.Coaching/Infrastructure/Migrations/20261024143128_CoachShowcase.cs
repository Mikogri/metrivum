using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Coaching.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CoachShowcase : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PortfolioItems",
                schema: "coaching",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Title = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    MediaId = table.Column<Guid>(type: "uuid", nullable: false),
                    ContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Size = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PortfolioItems", x => x.Id);
                    table.CheckConstraint("CK_PortfolioItem_Kind", "\"Kind\" IN ('Certificate','ClientResult','Other')");
                });

            migrationBuilder.CreateTable(
                name: "Showcases",
                schema: "coaching",
                columns: table => new
                {
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    Headline = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    YearsExperience = table.Column<int>(type: "integer", nullable: true),
                    Competencies = table.Column<List<string>>(type: "text[]", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Showcases", x => x.CoachId);
                    table.CheckConstraint("CK_Showcase_Competencies", "cardinality(\"Competencies\") <= 20");
                    table.CheckConstraint("CK_Showcase_Years", "\"YearsExperience\" IS NULL OR \"YearsExperience\" BETWEEN 0 AND 80");
                });

            migrationBuilder.CreateIndex(
                name: "IX_PortfolioItems_CoachId_CreatedAt",
                schema: "coaching",
                table: "PortfolioItems",
                columns: new[] { "CoachId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PortfolioItems_MediaId",
                schema: "coaching",
                table: "PortfolioItems",
                column: "MediaId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PortfolioItems",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "Showcases",
                schema: "coaching");
        }
    }
}
