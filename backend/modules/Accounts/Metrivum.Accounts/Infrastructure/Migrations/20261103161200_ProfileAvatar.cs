using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Accounts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ProfileAvatar : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AvatarMediaId",
                schema: "accounts",
                table: "profiles",
                type: "uuid",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AvatarMediaId",
                schema: "accounts",
                table: "profiles");
        }
    }
}
