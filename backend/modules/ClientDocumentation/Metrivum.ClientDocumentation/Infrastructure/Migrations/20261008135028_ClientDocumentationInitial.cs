using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.ClientDocumentation.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ClientDocumentationInitial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "client_documentation");

            migrationBuilder.CreateTable(
                name: "coach_notes",
                schema: "client_documentation",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Text = table.Column<string>(type: "character varying(20000)", maxLength: 20000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_coach_notes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "documents",
                schema: "client_documentation",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Category = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Visibility = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Text = table.Column<string>(type: "character varying(50000)", maxLength: 50000, nullable: true),
                    MediaId = table.Column<Guid>(type: "uuid", nullable: true),
                    ContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ObservedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_documents", x => x.Id);
                    table.CheckConstraint("ck_document_content", "(\"MediaId\" IS NOT NULL AND \"Text\" IS NULL) OR (\"MediaId\" IS NULL AND \"Text\" IS NOT NULL)");
                    table.CheckConstraint("ck_document_visibility", "\"Visibility\" IN ('CoachPrivate', 'SharedWithClient')");
                });

            migrationBuilder.CreateTable(
                name: "measurements",
                schema: "client_documentation",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Key = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Unit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Value = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    ObservedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Comment = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_measurements", x => x.Id);
                    table.CheckConstraint("ck_measurement_value", "\"Value\" >= 0");
                });

            migrationBuilder.CreateIndex(
                name: "IX_coach_notes_RelationshipId_CreatedAt_Id",
                schema: "client_documentation",
                table: "coach_notes",
                columns: new[] { "RelationshipId", "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_documents_MediaId",
                schema: "client_documentation",
                table: "documents",
                column: "MediaId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_documents_RelationshipId_Visibility_ObservedAt_Id",
                schema: "client_documentation",
                table: "documents",
                columns: new[] { "RelationshipId", "Visibility", "ObservedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_measurements_RelationshipId_Key_ObservedAt_Id",
                schema: "client_documentation",
                table: "measurements",
                columns: new[] { "RelationshipId", "Key", "ObservedAt", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "coach_notes",
                schema: "client_documentation");

            migrationBuilder.DropTable(
                name: "documents",
                schema: "client_documentation");

            migrationBuilder.DropTable(
                name: "measurements",
                schema: "client_documentation");
        }
    }
}
