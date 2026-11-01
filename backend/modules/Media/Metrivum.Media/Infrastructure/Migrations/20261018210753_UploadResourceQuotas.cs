using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Media.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UploadResourceQuotas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AcceptedAt",
                schema: "media",
                table: "files",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "ReservedStorageBytes",
                schema: "media",
                table: "files",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            // Existing capabilities may have been issued under the previous 2 GiB configurable ceiling.
            migrationBuilder.Sql("""
                UPDATE media.files SET "ReservedStorageBytes" = CASE
                    WHEN "UploadExpiresAt" > CURRENT_TIMESTAMP AND "State" <> 'Deleted'
                    THEN GREATEST("Size", 2147483648) ELSE "Size" END;
                UPDATE media.files SET "AcceptedAt" = CURRENT_TIMESTAMP WHERE "State" = 'Ready';
                """);

            migrationBuilder.CreateIndex(
                name: "IX_files_OwnerId_AcceptedAt",
                schema: "media",
                table: "files",
                columns: new[] { "OwnerId", "AcceptedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_files_OwnerId_AcceptedAt",
                schema: "media",
                table: "files");

            migrationBuilder.DropColumn(
                name: "AcceptedAt",
                schema: "media",
                table: "files");

            migrationBuilder.DropColumn(
                name: "ReservedStorageBytes",
                schema: "media",
                table: "files");
        }
    }
}
