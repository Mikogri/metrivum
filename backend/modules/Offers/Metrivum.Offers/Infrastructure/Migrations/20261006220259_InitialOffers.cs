using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Metrivum.Offers.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialOffers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "offers");

            migrationBuilder.CreateTable(
                name: "categories",
                schema: "offers",
                columns: table => new
                {
                    Key = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_categories", x => x.Key);
                });

            migrationBuilder.CreateTable(
                name: "tags",
                schema: "offers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tags", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "billing_options",
                schema: "offers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Model = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Price = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    MinSessions = table.Column<int>(type: "integer", nullable: true),
                    MaxSessions = table.Column<int>(type: "integer", nullable: true),
                    SessionCount = table.Column<int>(type: "integer", nullable: true),
                    PeriodCount = table.Column<int>(type: "integer", nullable: true),
                    PeriodUnit = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    DueRule = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    OffsetDays = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_billing_options", x => x.Id);
                    table.CheckConstraint("CK_option_price", "\"Price\" >= 0");
                    table.CheckConstraint("CK_option_shape", "(\"Model\" = 'PerSession' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'CustomPackage' AND \"MinSessions\" >= 1 AND \"MaxSessions\" >= \"MinSessions\" AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'FixedPackage' AND \"SessionCount\" >= 1 AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'PeriodSubscription' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND ((\"PeriodUnit\" = 'Week' AND \"PeriodCount\" BETWEEN 1 AND 52) OR (\"PeriodUnit\" = 'Month' AND \"PeriodCount\" BETWEEN 1 AND 12) OR (\"PeriodUnit\" = 'Year' AND \"PeriodCount\" = 1)))");
                });

            migrationBuilder.CreateTable(
                name: "offers",
                schema: "offers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    Category = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    CoachingMode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ApplicationFormVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    CurrentPublishedRevisionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_offers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_offers_categories_Category",
                        column: x => x.Category,
                        principalSchema: "offers",
                        principalTable: "categories",
                        principalColumn: "Key",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "revisions",
                schema: "offers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<int>(type: "integer", nullable: false),
                    DraftVersion = table.Column<long>(type: "bigint", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    Category = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    CoachingMode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Tags = table.Column<string>(type: "jsonb", nullable: false),
                    ApplicationFormVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    PublishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_revisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_revisions_offers_OfferId",
                        column: x => x.OfferId,
                        principalSchema: "offers",
                        principalTable: "offers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "tag_links",
                schema: "offers",
                columns: table => new
                {
                    OfferId = table.Column<Guid>(type: "uuid", nullable: false),
                    TagId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tag_links", x => new { x.OfferId, x.TagId });
                    table.ForeignKey(
                        name: "FK_tag_links_offers_OfferId",
                        column: x => x.OfferId,
                        principalSchema: "offers",
                        principalTable: "offers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_tag_links_tags_TagId",
                        column: x => x.TagId,
                        principalSchema: "offers",
                        principalTable: "tags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "revision_billing_options",
                schema: "offers",
                columns: table => new
                {
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Model = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Price = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    MinSessions = table.Column<int>(type: "integer", nullable: true),
                    MaxSessions = table.Column<int>(type: "integer", nullable: true),
                    SessionCount = table.Column<int>(type: "integer", nullable: true),
                    PeriodCount = table.Column<int>(type: "integer", nullable: true),
                    PeriodUnit = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    DueRule = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    OffsetDays = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_revision_billing_options", x => new { x.RevisionId, x.Id });
                    table.CheckConstraint("CK_revision_option_price", "\"Price\" >= 0");
                    table.CheckConstraint("CK_revision_option_shape", "(\"Model\" = 'PerSession' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'CustomPackage' AND \"MinSessions\" >= 1 AND \"MaxSessions\" >= \"MinSessions\" AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'FixedPackage' AND \"SessionCount\" >= 1 AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'PeriodSubscription' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND ((\"PeriodUnit\" = 'Week' AND \"PeriodCount\" BETWEEN 1 AND 52) OR (\"PeriodUnit\" = 'Month' AND \"PeriodCount\" BETWEEN 1 AND 12) OR (\"PeriodUnit\" = 'Year' AND \"PeriodCount\" = 1)))");
                    table.ForeignKey(
                        name: "FK_revision_billing_options_revisions_RevisionId",
                        column: x => x.RevisionId,
                        principalSchema: "offers",
                        principalTable: "revisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                schema: "offers",
                table: "categories",
                columns: new[] { "Key", "Active", "Name" },
                values: new object[,]
                {
                    { "conditioning", true, "conditioning" },
                    { "endurance", true, "endurance" },
                    { "general-fitness", true, "general-fitness" },
                    { "hypertrophy", true, "hypertrophy" },
                    { "strength", true, "strength" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_billing_options_OfferId",
                schema: "offers",
                table: "billing_options",
                column: "OfferId");

            migrationBuilder.CreateIndex(
                name: "IX_offers_Category",
                schema: "offers",
                table: "offers",
                column: "Category");

            migrationBuilder.CreateIndex(
                name: "IX_offers_CoachId_Status_UpdatedAt",
                schema: "offers",
                table: "offers",
                columns: new[] { "CoachId", "Status", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_offers_CurrentPublishedRevisionId",
                schema: "offers",
                table: "offers",
                column: "CurrentPublishedRevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_revisions_OfferId_DraftVersion",
                schema: "offers",
                table: "revisions",
                columns: new[] { "OfferId", "DraftVersion" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_revisions_OfferId_Number",
                schema: "offers",
                table: "revisions",
                columns: new[] { "OfferId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_tag_links_TagId",
                schema: "offers",
                table: "tag_links",
                column: "TagId");

            migrationBuilder.CreateIndex(
                name: "IX_tags_Name",
                schema: "offers",
                table: "tags",
                column: "Name",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_billing_options_offers_OfferId",
                schema: "offers",
                table: "billing_options",
                column: "OfferId",
                principalSchema: "offers",
                principalTable: "offers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_offers_revisions_CurrentPublishedRevisionId",
                schema: "offers",
                table: "offers",
                column: "CurrentPublishedRevisionId",
                principalSchema: "offers",
                principalTable: "revisions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
            migrationBuilder.Sql("""
                CREATE FUNCTION offers.reject_immutable_change() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
                BEGIN RAISE EXCEPTION 'Published offer terms are immutable' USING ERRCODE = '23514'; END $$;
                REVOKE ALL ON FUNCTION offers.reject_immutable_change() FROM PUBLIC;
                CREATE TRIGGER immutable_offer_revision BEFORE UPDATE OR DELETE ON offers.revisions FOR EACH ROW EXECUTE FUNCTION offers.reject_immutable_change();
                CREATE TRIGGER immutable_offer_option BEFORE UPDATE OR DELETE ON offers.revision_billing_options FOR EACH ROW EXECUTE FUNCTION offers.reject_immutable_change();
                ALTER TABLE offers.offers ADD CONSTRAINT "CK_offer_status" CHECK ("Status" IN ('Draft','Active','Inactive','Archived') AND ("Status" <> 'Active' OR "CurrentPublishedRevisionId" IS NOT NULL));
                ALTER TABLE offers.billing_options ADD CONSTRAINT "CK_option_terms" CHECK (("DueRule" = 'CustomOffsetDays' AND "OffsetDays" IS NOT NULL AND "OffsetDays" BETWEEN 0 AND 365) OR ("DueRule" IN ('Upfront','OnStart','EndOfServicePeriod','EndOfCalendarMonth') AND "OffsetDays" IS NULL));
                ALTER TABLE offers.revision_billing_options ADD CONSTRAINT "CK_revision_option_terms" CHECK (("DueRule" = 'CustomOffsetDays' AND "OffsetDays" IS NOT NULL AND "OffsetDays" BETWEEN 0 AND 365) OR ("DueRule" IN ('Upfront','OnStart','EndOfServicePeriod','EndOfCalendarMonth') AND "OffsetDays" IS NULL));
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_revisions_offers_OfferId",
                schema: "offers",
                table: "revisions");

            migrationBuilder.DropTable(
                name: "billing_options",
                schema: "offers");

            migrationBuilder.DropTable(
                name: "revision_billing_options",
                schema: "offers");

            migrationBuilder.DropTable(
                name: "tag_links",
                schema: "offers");

            migrationBuilder.DropTable(
                name: "tags",
                schema: "offers");

            migrationBuilder.DropTable(
                name: "offers",
                schema: "offers");

            migrationBuilder.DropTable(
                name: "categories",
                schema: "offers");

            migrationBuilder.DropTable(
                name: "revisions",
                schema: "offers");
            migrationBuilder.Sql("DROP FUNCTION offers.reject_immutable_change();");
        }
    }
}
