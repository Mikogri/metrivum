using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Messaging.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MessagingAbuseBudgets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AbuseRecords",
                schema: "messaging",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientId = table.Column<Guid>(type: "uuid", nullable: true),
                    Kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AbuseRecords", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AbuseRecords_UserId_Kind_CreatedAt",
                schema: "messaging",
                table: "AbuseRecords",
                columns: new[] { "UserId", "Kind", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AbuseRecords_UserId_RecipientId",
                schema: "messaging",
                table: "AbuseRecords",
                columns: new[] { "UserId", "RecipientId" },
                unique: true,
                filter: "\"Kind\" = 'contact'");

            migrationBuilder.Sql("""
                REVOKE ALL ON messaging."AbuseRecords" FROM PUBLIC;
                DO $$ BEGIN
                    IF EXISTS (SELECT FROM pg_roles WHERE rolname='trainflow_api') THEN
                        GRANT SELECT, INSERT, DELETE ON messaging."AbuseRecords" TO trainflow_api;
                    END IF;
                    IF EXISTS (SELECT FROM pg_roles WHERE rolname='trainflow_worker') THEN
                        REVOKE ALL ON messaging."AbuseRecords" FROM trainflow_worker;
                    END IF;
                    IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
                        REVOKE ALL ON messaging."AbuseRecords" FROM anon;
                    END IF;
                    IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
                        REVOKE ALL ON messaging."AbuseRecords" FROM authenticated;
                    END IF;
                END $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AbuseRecords",
                schema: "messaging");
        }
    }
}
