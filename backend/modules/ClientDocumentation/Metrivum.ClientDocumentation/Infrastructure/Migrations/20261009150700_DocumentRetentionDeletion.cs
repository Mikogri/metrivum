using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.ClientDocumentation.Infrastructure.Migrations;

public partial class DocumentRetentionDeletion : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.AddColumn<DateTimeOffset>(
        name: "DeletedAt", schema: "client_documentation", table: "documents", type: "timestamp with time zone", nullable: true);

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropColumn(
        name: "DeletedAt", schema: "client_documentation", table: "documents");
}
