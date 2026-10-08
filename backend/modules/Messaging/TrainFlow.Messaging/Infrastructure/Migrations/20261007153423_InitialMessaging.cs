using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Messaging.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialMessaging : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "messaging");

            migrationBuilder.CreateTable(
                name: "Blocks",
                schema: "messaging",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    BlockedUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Blocks", x => new { x.UserId, x.BlockedUserId });
                    table.CheckConstraint("CK_Block_NoSelf", "\"UserId\" <> \"BlockedUserId\"");
                });

            migrationBuilder.CreateTable(
                name: "Conversations",
                schema: "messaging",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    PairFirst = table.Column<Guid>(type: "uuid", nullable: true),
                    PairSecond = table.Column<Guid>(type: "uuid", nullable: true),
                    ClientGroupId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Sequence = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Conversations", x => x.Id);
                    table.CheckConstraint("CK_Conversation_Pair", "(\"Type\" = 'Direct' AND \"PairFirst\" IS NOT NULL AND \"PairSecond\" IS NOT NULL AND \"PairFirst\" < \"PairSecond\" AND \"ClientGroupId\" IS NULL) OR (\"Type\" = 'Group' AND \"PairFirst\" IS NULL AND \"PairSecond\" IS NULL AND \"ClientGroupId\" IS NULL) OR (\"Type\" = 'ClientGroupLinked' AND \"PairFirst\" IS NULL AND \"PairSecond\" IS NULL AND \"ClientGroupId\" IS NOT NULL)");
                });

            migrationBuilder.CreateTable(
                name: "Members",
                schema: "messaging",
                columns: table => new
                {
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Source = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Role = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    State = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Excluded = table.Column<bool>(type: "boolean", nullable: false),
                    JoinedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RemovedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CutoffSequence = table.Column<long>(type: "bigint", nullable: true),
                    LastReadSequence = table.Column<long>(type: "bigint", nullable: false),
                    LastReadMessageId = table.Column<Guid>(type: "uuid", nullable: true),
                    LastReadAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Members", x => new { x.ConversationId, x.UserId });
                    table.CheckConstraint("CK_Member_Boundary", "(\"State\"='Active' AND \"CutoffSequence\" IS NULL AND \"RemovedAt\" IS NULL AND NOT \"Excluded\") OR (\"State\" IN ('Removed','Left','Banned') AND \"CutoffSequence\" IS NOT NULL AND \"RemovedAt\" IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_Members_Conversations_ConversationId",
                        column: x => x.ConversationId,
                        principalSchema: "messaging",
                        principalTable: "Conversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Messages",
                schema: "messaging",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    SenderUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Body = table.Column<string>(type: "character varying(8000)", maxLength: 8000, nullable: true),
                    ReplyToMessageId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Sequence = table.Column<long>(type: "bigint", nullable: false),
                    IdempotencyKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Messages", x => x.Id);
                    table.UniqueConstraint("AK_Messages_ConversationId_Id", x => new { x.ConversationId, x.Id });
                    table.CheckConstraint("CK_Message_Sequence", "\"Sequence\" > 0");
                    table.CheckConstraint("CK_Message_Type", "\"Type\" IN ('Text','Image','File','Video','VoiceMessage','System')");
                    table.ForeignKey(
                        name: "FK_Messages_Conversations_ConversationId",
                        column: x => x.ConversationId,
                        principalSchema: "messaging",
                        principalTable: "Conversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Messages_Messages_ConversationId_ReplyToMessageId",
                        columns: x => new { x.ConversationId, x.ReplyToMessageId },
                        principalSchema: "messaging",
                        principalTable: "Messages",
                        principalColumns: new[] { "ConversationId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Requests",
                schema: "messaging",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SenderUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PairFirst = table.Column<Guid>(type: "uuid", nullable: false),
                    PairSecond = table.Column<Guid>(type: "uuid", nullable: false),
                    Body = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    State = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Requests", x => x.Id);
                    table.CheckConstraint("CK_Request_NoSelf", "\"SenderUserId\" <> \"RecipientUserId\" AND \"PairFirst\" < \"PairSecond\"");
                    table.ForeignKey(
                        name: "FK_Requests_Conversations_ConversationId",
                        column: x => x.ConversationId,
                        principalSchema: "messaging",
                        principalTable: "Conversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MembershipChanges",
                schema: "messaging",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    State = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Source = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    BoundarySequence = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MembershipChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MembershipChanges_Members_ConversationId_UserId",
                        columns: x => new { x.ConversationId, x.UserId },
                        principalSchema: "messaging",
                        principalTable: "Members",
                        principalColumns: new[] { "ConversationId", "UserId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Attachments",
                schema: "messaging",
                columns: table => new
                {
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    MediaId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    ContentType = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Size = table.Column<long>(type: "bigint", nullable: false),
                    DurationMs = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Attachments", x => new { x.MessageId, x.MediaId });
                    table.ForeignKey(
                        name: "FK_Attachments_Messages_MessageId",
                        column: x => x.MessageId,
                        principalSchema: "messaging",
                        principalTable: "Messages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Reports",
                schema: "messaging",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ReporterUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Category = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Details = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Evidence = table.Column<string>(type: "jsonb", nullable: false),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Reports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Reports_Messages_ConversationId_MessageId",
                        columns: x => new { x.ConversationId, x.MessageId },
                        principalSchema: "messaging",
                        principalTable: "Messages",
                        principalColumns: new[] { "ConversationId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Conversations_ClientGroupId",
                schema: "messaging",
                table: "Conversations",
                column: "ClientGroupId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Conversations_PairFirst_PairSecond",
                schema: "messaging",
                table: "Conversations",
                columns: new[] { "PairFirst", "PairSecond" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Members_UserId_State",
                schema: "messaging",
                table: "Members",
                columns: new[] { "UserId", "State" });

            migrationBuilder.CreateIndex(
                name: "IX_MembershipChanges_ConversationId_UserId_OccurredAt",
                schema: "messaging",
                table: "MembershipChanges",
                columns: new[] { "ConversationId", "UserId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Messages_ConversationId_CreatedAt_Id",
                schema: "messaging",
                table: "Messages",
                columns: new[] { "ConversationId", "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Messages_ConversationId_ReplyToMessageId",
                schema: "messaging",
                table: "Messages",
                columns: new[] { "ConversationId", "ReplyToMessageId" });

            migrationBuilder.CreateIndex(
                name: "IX_Messages_ConversationId_SenderUserId_IdempotencyKey",
                schema: "messaging",
                table: "Messages",
                columns: new[] { "ConversationId", "SenderUserId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Messages_ConversationId_Sequence",
                schema: "messaging",
                table: "Messages",
                columns: new[] { "ConversationId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Reports_ConversationId_MessageId",
                schema: "messaging",
                table: "Reports",
                columns: new[] { "ConversationId", "MessageId" });

            migrationBuilder.CreateIndex(
                name: "IX_Requests_ConversationId",
                schema: "messaging",
                table: "Requests",
                column: "ConversationId");

            migrationBuilder.CreateIndex(
                name: "IX_Requests_PairFirst_PairSecond",
                schema: "messaging",
                table: "Requests",
                columns: new[] { "PairFirst", "PairSecond" },
                unique: true,
                filter: "\"State\" = 'Pending'");

            migrationBuilder.CreateIndex(
                name: "IX_Requests_RecipientUserId_State_CreatedAt",
                schema: "messaging",
                table: "Requests",
                columns: new[] { "RecipientUserId", "State", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Attachments",
                schema: "messaging");

            migrationBuilder.DropTable(
                name: "Blocks",
                schema: "messaging");

            migrationBuilder.DropTable(
                name: "MembershipChanges",
                schema: "messaging");

            migrationBuilder.DropTable(
                name: "Reports",
                schema: "messaging");

            migrationBuilder.DropTable(
                name: "Requests",
                schema: "messaging");

            migrationBuilder.DropTable(
                name: "Members",
                schema: "messaging");

            migrationBuilder.DropTable(
                name: "Messages",
                schema: "messaging");

            migrationBuilder.DropTable(
                name: "Conversations",
                schema: "messaging");
        }
    }
}
