using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Access.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialAccess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "access");

            migrationBuilder.CreateTable(
                name: "audit",
                schema: "access",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Operation = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Subject = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Change = table.Column<string>(type: "jsonb", nullable: false),
                    At = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audit", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "configurations",
                schema: "access",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    GrantedFeatures = table.Column<string[]>(type: "text[]", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_configurations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "flags",
                schema: "access",
                columns: table => new
                {
                    Key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_flags", x => x.Key);
                });

            migrationBuilder.CreateTable(
                name: "overrides",
                schema: "access",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Granted = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_overrides", x => new { x.UserId, x.Key });
                });

            migrationBuilder.CreateTable(
                name: "assignments",
                schema: "access",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConfigurationId = table.Column<string>(type: "character varying(64)", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assignments", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_assignments_configurations_ConfigurationId",
                        column: x => x.ConfigurationId,
                        principalSchema: "access",
                        principalTable: "configurations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_assignments_ConfigurationId",
                schema: "access",
                table: "assignments",
                column: "ConfigurationId");

            migrationBuilder.CreateIndex(
                name: "IX_audit_At_Id",
                schema: "access",
                table: "audit",
                columns: new[] { "At", "Id" });
            migrationBuilder.Sql("ALTER TABLE access.configurations DISABLE ROW LEVEL SECURITY;");
            migrationBuilder.Sql("ALTER TABLE access.assignments DISABLE ROW LEVEL SECURITY;");
            migrationBuilder.Sql("ALTER TABLE access.overrides DISABLE ROW LEVEL SECURITY;");
            migrationBuilder.Sql("ALTER TABLE access.flags DISABLE ROW LEVEL SECURITY;");
            migrationBuilder.Sql("ALTER TABLE access.audit DISABLE ROW LEVEL SECURITY;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "assignments",
                schema: "access");

            migrationBuilder.DropTable(
                name: "audit",
                schema: "access");

            migrationBuilder.DropTable(
                name: "flags",
                schema: "access");

            migrationBuilder.DropTable(
                name: "overrides",
                schema: "access");

            migrationBuilder.DropTable(
                name: "configurations",
                schema: "access");
        }
    }
}
