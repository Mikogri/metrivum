using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Messaging.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UnifiedConversationConsent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "IntroductionMessageId", schema: "messaging", table: "Requests", type: "uuid", nullable: true);
            migrationBuilder.AlterColumn<string>(
                name: "Body", schema: "messaging", table: "Requests", type: "character varying(8000)", maxLength: 8000, nullable: false,
                oldClrType: typeof(string), oldType: "character varying(2000)", oldMaxLength: 2000);
            migrationBuilder.AddColumn<string>(
                name: "CoachingEntryJson",
                schema: "messaging",
                table: "Messages",
                type: "jsonb",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Preferences",
                schema: "messaging",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequireApproval = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Preferences", x => x.UserId);
                });

            // Preserve existing pending consent while making its introduction visible in normal chat.
            // This migration emits no notifications and never turns Pending into Accepted.
            migrationBuilder.Sql("""
                INSERT INTO messaging."Conversations" ("Id","Type","Title","PairFirst","PairSecond","CreatedAt","UpdatedAt","Sequence")
                SELECT "Id",'Direct','',"PairFirst","PairSecond","CreatedAt","CreatedAt",0
                FROM messaging."Requests" WHERE "State"='Pending' AND "ConversationId" IS NULL
                ON CONFLICT ("PairFirst","PairSecond") DO NOTHING;

                UPDATE messaging."Requests" r SET "ConversationId"=c."Id"
                FROM messaging."Conversations" c
                WHERE r."State"='Pending' AND r."ConversationId" IS NULL
                  AND c."PairFirst"=r."PairFirst" AND c."PairSecond"=r."PairSecond";

                INSERT INTO messaging."Members" ("ConversationId","UserId","Source","Role","State","Excluded","JoinedAt","LastReadSequence")
                SELECT r."ConversationId",users.id,'Direct','Member','Active',false,r."CreatedAt",0
                FROM messaging."Requests" r CROSS JOIN LATERAL (VALUES(r."SenderUserId"),(r."RecipientUserId")) users(id)
                WHERE r."State"='Pending'
                ON CONFLICT ("ConversationId","UserId") DO NOTHING;

                INSERT INTO messaging."Messages" ("Id","ConversationId","SenderUserId","Type","Body","CreatedAt","Sequence","IdempotencyKey","RequestHash")
                SELECT md5(r."Id"::text || ':intro')::uuid,r."ConversationId",r."SenderUserId",'Text',r."Body",r."CreatedAt",c."Sequence"+1,'request:' || r."Id",'request:' || r."Id"
                FROM messaging."Requests" r JOIN messaging."Conversations" c ON c."Id"=r."ConversationId"
                WHERE r."State"='Pending' AND NOT EXISTS (SELECT 1 FROM messaging."Messages" m WHERE m."ConversationId"=r."ConversationId" AND m."IdempotencyKey"='request:' || r."Id");

                UPDATE messaging."Conversations" c SET "Sequence"=m.seq,"UpdatedAt"=GREATEST(c."UpdatedAt",m.latest)
                FROM (SELECT "ConversationId",max("Sequence") seq,max("CreatedAt") latest FROM messaging."Messages" GROUP BY "ConversationId") m
                WHERE c."Id"=m."ConversationId" AND c."Sequence"<m.seq;

                UPDATE messaging."Requests" r SET "IntroductionMessageId"=m."Id"
                FROM messaging."Messages" m
                WHERE m."ConversationId"=r."ConversationId" AND m."SenderUserId"=r."SenderUserId"
                  AND m."IdempotencyKey"='request:' || r."Id";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "IntroductionMessageId", schema: "messaging", table: "Requests");
            // Keep the widened text column so rollback does not truncate committed introductions.
            migrationBuilder.DropTable(
                name: "Preferences",
                schema: "messaging");

            migrationBuilder.DropColumn(
                name: "CoachingEntryJson",
                schema: "messaging",
                table: "Messages");
        }
    }
}
