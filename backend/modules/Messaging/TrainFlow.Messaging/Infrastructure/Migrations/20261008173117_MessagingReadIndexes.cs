using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Messaging.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MessagingReadIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Blocks_BlockedUserId",
                schema: "messaging",
                table: "Blocks",
                column: "BlockedUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Blocks_BlockedUserId",
                schema: "messaging",
                table: "Blocks");
        }
    }
}
