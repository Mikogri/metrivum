using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace TrainFlow.Coaching.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CoachSpecializations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CoachSpecializationProfiles",
                schema: "coaching",
                columns: table => new
                {
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoachSpecializationProfiles", x => x.CoachId);
                });

            migrationBuilder.CreateTable(
                name: "SpecializationCategories",
                schema: "coaching",
                columns: table => new
                {
                    Code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpecializationCategories", x => x.Code);
                });

            migrationBuilder.CreateTable(
                name: "CoachSpecializationChanges",
                schema: "coaching",
                columns: table => new
                {
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    SelectedCodes = table.Column<List<string>>(type: "text[]", nullable: false),
                    PrimaryCodes = table.Column<List<string>>(type: "text[]", nullable: false),
                    ChangedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoachSpecializationChanges", x => new { x.CoachId, x.Version });
                    table.ForeignKey(
                        name: "FK_CoachSpecializationChanges_CoachSpecializationProfiles_Coac~",
                        column: x => x.CoachId,
                        principalSchema: "coaching",
                        principalTable: "CoachSpecializationProfiles",
                        principalColumn: "CoachId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Specializations",
                schema: "coaching",
                columns: table => new
                {
                    Code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    CategoryCode = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Specializations", x => x.Code);
                    table.ForeignKey(
                        name: "FK_Specializations_SpecializationCategories_CategoryCode",
                        column: x => x.CategoryCode,
                        principalSchema: "coaching",
                        principalTable: "SpecializationCategories",
                        principalColumn: "Code",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CoachSpecializations",
                schema: "coaching",
                columns: table => new
                {
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    SpecializationCode = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    IsPrimary = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoachSpecializations", x => new { x.CoachId, x.SpecializationCode });
                    table.ForeignKey(
                        name: "FK_CoachSpecializations_CoachSpecializationProfiles_CoachId",
                        column: x => x.CoachId,
                        principalSchema: "coaching",
                        principalTable: "CoachSpecializationProfiles",
                        principalColumn: "CoachId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CoachSpecializations_Specializations_SpecializationCode",
                        column: x => x.SpecializationCode,
                        principalSchema: "coaching",
                        principalTable: "Specializations",
                        principalColumn: "Code",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                schema: "coaching",
                table: "SpecializationCategories",
                columns: new[] { "Code", "Active", "Name", "SortOrder" },
                values: new object[,]
                {
                    { "athletic_performance", true, "Athletic Performance", 2 },
                    { "endurance_conditioning", true, "Endurance & Conditioning", 1 },
                    { "general_fitness", true, "General Fitness", 3 },
                    { "specialized_training", true, "Specialized Training", 4 },
                    { "strength_muscle", true, "Strength & Muscle", 0 }
                });

            migrationBuilder.InsertData(
                schema: "coaching",
                table: "Specializations",
                columns: new[] { "Code", "Active", "CategoryCode", "Name", "SortOrder" },
                values: new object[,]
                {
                    { "adaptive_fitness", true, "specialized_training", "Adaptive Fitness", 5 },
                    { "aerobic_conditioning", true, "endurance_conditioning", "Aerobic Conditioning", 0 },
                    { "anaerobic_conditioning", true, "endurance_conditioning", "Anaerobic Conditioning", 1 },
                    { "bodybuilding", true, "strength_muscle", "Bodybuilding", 4 },
                    { "calisthenics", true, "strength_muscle", "Calisthenics", 6 },
                    { "crossfit_functional_competition", true, "specialized_training", "CrossFit / Functional Competition", 0 },
                    { "endurance_training", true, "endurance_conditioning", "Endurance Training", 3 },
                    { "fat_loss_recomposition", true, "general_fitness", "Fat Loss & Body Recomposition", 2 },
                    { "functional_fitness", true, "general_fitness", "Functional Fitness", 1 },
                    { "general_fitness", true, "general_fitness", "General Fitness", 0 },
                    { "hybrid_training", true, "endurance_conditioning", "Hybrid Training", 4 },
                    { "hypertrophy", true, "strength_muscle", "Hypertrophy", 3 },
                    { "interval_training", true, "endurance_conditioning", "Interval Training / HIIT", 2 },
                    { "mobility_flexibility", true, "general_fitness", "Mobility & Flexibility", 3 },
                    { "olympic_weightlifting", true, "strength_muscle", "Olympic Weightlifting", 2 },
                    { "performance_testing", true, "athletic_performance", "Performance Testing", 4 },
                    { "power_plyometrics", true, "athletic_performance", "Power & Plyometrics", 2 },
                    { "powerlifting", true, "strength_muscle", "Powerlifting", 1 },
                    { "prenatal_postnatal_fitness", true, "specialized_training", "Prenatal & Postnatal Fitness", 4 },
                    { "return_to_sport", true, "specialized_training", "Return to Sport", 2 },
                    { "senior_fitness", true, "specialized_training", "Senior Fitness", 3 },
                    { "speed_agility", true, "athletic_performance", "Speed & Agility", 1 },
                    { "sport_specific_training", true, "athletic_performance", "Sport-Specific Training", 3 },
                    { "strength_conditioning", true, "athletic_performance", "Strength & Conditioning", 0 },
                    { "strength_training", true, "strength_muscle", "Strength Training", 0 },
                    { "strongman", true, "strength_muscle", "Strongman", 5 },
                    { "tactical_fitness", true, "specialized_training", "Tactical Fitness", 1 }
                });

            migrationBuilder.CreateIndex(
                name: "IX_ClientTransferRequests_RelationshipId_All",
                schema: "coaching",
                table: "ClientTransferRequests",
                column: "RelationshipId");

            migrationBuilder.CreateIndex(
                name: "IX_CoachSpecializations_SpecializationCode_CoachId_IsPrimary",
                schema: "coaching",
                table: "CoachSpecializations",
                columns: new[] { "SpecializationCode", "CoachId", "IsPrimary" });

            migrationBuilder.CreateIndex(
                name: "IX_Specializations_CategoryCode",
                schema: "coaching",
                table: "Specializations",
                column: "CategoryCode");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CoachSpecializationChanges",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "CoachSpecializations",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "CoachSpecializationProfiles",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "Specializations",
                schema: "coaching");

            migrationBuilder.DropTable(
                name: "SpecializationCategories",
                schema: "coaching");

            migrationBuilder.DropIndex(
                name: "IX_ClientTransferRequests_RelationshipId_All",
                schema: "coaching",
                table: "ClientTransferRequests");
        }
    }
}
