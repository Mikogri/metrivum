using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Coaching.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CoachDiscovery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DiscoveryProfiles",
                schema: "coaching",
                columns: table => new
                {
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    Published = table.Column<bool>(type: "boolean", nullable: false),
                    Specializations = table.Column<List<string>>(type: "text[]", nullable: false),
                    Languages = table.Column<List<string>>(type: "text[]", nullable: false),
                    Modes = table.Column<List<string>>(type: "text[]", nullable: false),
                    Location = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiscoveryProfiles", x => x.CoachId);
                    table.CheckConstraint("CK_Discovery_Arrays", "cardinality(\"Specializations\") <= 20 AND cardinality(\"Languages\") <= 10 AND cardinality(\"Modes\") <= 3");
                    table.CheckConstraint("CK_Discovery_Modes", "\"Modes\" <@ ARRAY['Online','Offline','Hybrid']::text[]");
                });

            migrationBuilder.CreateIndex(
                name: "IX_DiscoveryProfiles_Languages",
                schema: "coaching",
                table: "DiscoveryProfiles",
                column: "Languages")
                .Annotation("Npgsql:IndexMethod", "gin");

            migrationBuilder.CreateIndex(
                name: "IX_DiscoveryProfiles_Modes",
                schema: "coaching",
                table: "DiscoveryProfiles",
                column: "Modes")
                .Annotation("Npgsql:IndexMethod", "gin");

            migrationBuilder.CreateIndex(
                name: "IX_DiscoveryProfiles_Published_CoachId",
                schema: "coaching",
                table: "DiscoveryProfiles",
                columns: new[] { "Published", "CoachId" });

            migrationBuilder.CreateIndex(
                name: "IX_DiscoveryProfiles_Specializations",
                schema: "coaching",
                table: "DiscoveryProfiles",
                column: "Specializations")
                .Annotation("Npgsql:IndexMethod", "gin");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DiscoveryProfiles",
                schema: "coaching");
        }
    }
}
