using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TeamOrganizations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$ BEGIN
                    IF EXISTS (SELECT FROM billing.teams) OR EXISTS (SELECT FROM billing.platform_subscriptions WHERE "PlanId"='Team') THEN
                        RAISE EXCEPTION 'Legacy Team data requires an audited paid-seat reconciliation before Stage 6; no data was changed';
                    END IF;
                END $$;
                """);
            migrationBuilder.DropForeignKey(
                name: "FK_team_memberships_teams_TeamId",
                schema: "billing",
                table: "team_memberships");

            migrationBuilder.DropForeignKey(
                name: "FK_team_requests_teams_TeamId",
                schema: "billing",
                table: "team_requests");

            migrationBuilder.DropIndex(
                name: "IX_teams_OwnerId",
                schema: "billing",
                table: "teams");

            migrationBuilder.DropIndex(
                name: "IX_team_memberships_UserId",
                schema: "billing",
                table: "team_memberships");

            migrationBuilder.DropIndex(
                name: "IX_payment_dues_ClientId_PeriodStart",
                schema: "billing",
                table: "payment_dues");

            migrationBuilder.AddColumn<string>(
                name: "Description",
                schema: "billing",
                table: "teams",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DissolutionAt",
                schema: "billing",
                table: "teams",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "OwnershipExpiresAt",
                schema: "billing",
                table: "teams",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PendingOwnerId",
                schema: "billing",
                table: "teams",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                schema: "billing",
                table: "teams",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<long>(
                name: "Version",
                schema: "billing",
                table: "teams",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DecidedAt",
                schema: "billing",
                table: "team_requests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ExpiresAt",
                schema: "billing",
                table: "team_requests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "InviterId",
                schema: "billing",
                table: "team_requests",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<string>(
                name: "Role",
                schema: "billing",
                table: "team_requests",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EndedAt",
                schema: "billing",
                table: "team_memberships",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Role",
                schema: "billing",
                table: "team_memberships",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Status",
                schema: "billing",
                table: "team_memberships",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "TeamClientCaseId",
                schema: "billing",
                table: "payments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TeamId",
                schema: "billing",
                table: "payments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TeamClientCaseId",
                schema: "billing",
                table: "payment_dues",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TeamId",
                schema: "billing",
                table: "payment_dues",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TeamClientCaseId",
                schema: "billing",
                table: "orders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TeamId",
                schema: "billing",
                table: "orders",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "team_audit",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: true),
                    SubjectId = table.Column<Guid>(type: "uuid", nullable: true),
                    Action = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_team_audit", x => x.Id);
                    table.ForeignKey(
                        name: "FK_team_audit_teams_TeamId",
                        column: x => x.TeamId,
                        principalSchema: "billing",
                        principalTable: "teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "team_billing_quotes",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamId = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamName = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    PurchasedSeats = table.Column<int>(type: "integer", nullable: false),
                    PriceId = table.Column<Guid>(type: "uuid", nullable: false),
                    GrossAmount = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    CreditAmount = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    AmountDue = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    AutoRenew = table.Column<bool>(type: "boolean", nullable: false),
                    PaymentMethodId = table.Column<Guid>(type: "uuid", nullable: true),
                    DueId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourceSubscriptionId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourcePaymentId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourcePeriodStart = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    SourcePeriodEnd = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    SubscriptionVersion = table.Column<long>(type: "bigint", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ConfirmedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_team_billing_quotes", x => x.Id);
                    table.CheckConstraint("CK_team_quote_money", "\"PurchasedSeats\" >= 1 AND \"CreditAmount\" >= 0 AND \"AmountDue\" >= 0 AND \"GrossAmount\" = \"CreditAmount\" + \"AmountDue\"");
                    table.ForeignKey(
                        name: "FK_team_billing_quotes_payment_dues_DueId",
                        column: x => x.DueId,
                        principalSchema: "billing",
                        principalTable: "payment_dues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_team_billing_quotes_payments_SourcePaymentId",
                        column: x => x.SourcePaymentId,
                        principalSchema: "billing",
                        principalTable: "payments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_team_billing_quotes_plan_prices_PriceId",
                        column: x => x.PriceId,
                        principalSchema: "billing",
                        principalTable: "plan_prices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_team_billing_quotes_platform_subscriptions_SourceSubscripti~",
                        column: x => x.SourceSubscriptionId,
                        principalSchema: "billing",
                        principalTable: "platform_subscriptions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "team_platform_subscriptions",
                schema: "billing",
                columns: table => new
                {
                    TeamId = table.Column<Guid>(type: "uuid", nullable: false),
                    AcceptedPriceId = table.Column<Guid>(type: "uuid", nullable: false),
                    PurchasedSeats = table.Column<int>(type: "integer", nullable: false),
                    PendingSeats = table.Column<int>(type: "integer", nullable: true),
                    PeriodStart = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PeriodEnd = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AutoRenew = table.Column<bool>(type: "boolean", nullable: false),
                    PaymentMethodId = table.Column<Guid>(type: "uuid", nullable: true),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_team_platform_subscriptions", x => x.TeamId);
                    table.CheckConstraint("CK_team_subscription_seats", "\"PurchasedSeats\" >= 1 AND (\"PendingSeats\" IS NULL OR \"PendingSeats\" >= 1)");
                    table.ForeignKey(
                        name: "FK_team_platform_subscriptions_payment_methods_PaymentMethodId",
                        column: x => x.PaymentMethodId,
                        principalSchema: "billing",
                        principalTable: "payment_methods",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_team_platform_subscriptions_plan_prices_AcceptedPriceId",
                        column: x => x.AcceptedPriceId,
                        principalSchema: "billing",
                        principalTable: "plan_prices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_team_platform_subscriptions_teams_TeamId",
                        column: x => x.TeamId,
                        principalSchema: "billing",
                        principalTable: "teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "proration_credits",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    QuoteId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceSubscriptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourcePaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourcePeriodStart = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    SourcePeriodEnd = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_proration_credits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_proration_credits_orders_OrderId",
                        column: x => x.OrderId,
                        principalSchema: "billing",
                        principalTable: "orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_proration_credits_payments_SourcePaymentId",
                        column: x => x.SourcePaymentId,
                        principalSchema: "billing",
                        principalTable: "payments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_proration_credits_platform_subscriptions_SourceSubscription~",
                        column: x => x.SourceSubscriptionId,
                        principalSchema: "billing",
                        principalTable: "platform_subscriptions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_proration_credits_team_billing_quotes_QuoteId",
                        column: x => x.QuoteId,
                        principalSchema: "billing",
                        principalTable: "team_billing_quotes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_teams_DissolutionAt",
                schema: "billing",
                table: "teams",
                column: "DissolutionAt",
                filter: "\"Status\" = 'DissolutionScheduled'");

            migrationBuilder.CreateIndex(
                name: "IX_teams_OwnerId",
                schema: "billing",
                table: "teams",
                column: "OwnerId",
                unique: true,
                filter: "\"Status\" <> 'Dissolved'");

            migrationBuilder.CreateIndex(
                name: "IX_team_memberships_TeamId",
                schema: "billing",
                table: "team_memberships",
                column: "TeamId",
                unique: true,
                filter: "\"Role\" = 'Owner' AND \"Status\" = 'Active'");

            migrationBuilder.CreateIndex(
                name: "IX_team_memberships_UserId",
                schema: "billing",
                table: "team_memberships",
                column: "UserId",
                unique: true,
                filter: "\"Status\" = 'Active'");

            migrationBuilder.AddCheckConstraint(
                name: "CK_team_member_role",
                schema: "billing",
                table: "team_memberships",
                sql: "\"Role\" IN ('Owner','Admin','Member')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_team_member_status",
                schema: "billing",
                table: "team_memberships",
                sql: "\"Status\" IN ('Active','Ended')");

            migrationBuilder.CreateIndex(
                name: "IX_payments_TeamId_CoachId_SettledAt",
                schema: "billing",
                table: "payments",
                columns: new[] { "TeamId", "CoachId", "SettledAt" });

            migrationBuilder.CreateIndex(
                name: "IX_payment_dues_ClientId_PeriodStart",
                schema: "billing",
                table: "payment_dues",
                columns: new[] { "ClientId", "PeriodStart" },
                filter: "\"Context\" = 'Platform'");

            migrationBuilder.CreateIndex(
                name: "IX_payment_dues_TeamId_CoachId_DueAt",
                schema: "billing",
                table: "payment_dues",
                columns: new[] { "TeamId", "CoachId", "DueAt" });

            migrationBuilder.CreateIndex(
                name: "IX_orders_TeamId_CoachId_CreatedAt",
                schema: "billing",
                table: "orders",
                columns: new[] { "TeamId", "CoachId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_proration_credits_OrderId",
                schema: "billing",
                table: "proration_credits",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_proration_credits_QuoteId",
                schema: "billing",
                table: "proration_credits",
                column: "QuoteId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_proration_credits_SourcePaymentId",
                schema: "billing",
                table: "proration_credits",
                column: "SourcePaymentId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_proration_credits_SourceSubscriptionId_SourcePeriodStart_So~",
                schema: "billing",
                table: "proration_credits",
                columns: new[] { "SourceSubscriptionId", "SourcePeriodStart", "SourcePeriodEnd" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_team_audit_TeamId_CreatedAt",
                schema: "billing",
                table: "team_audit",
                columns: new[] { "TeamId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_team_billing_quotes_DueId",
                schema: "billing",
                table: "team_billing_quotes",
                column: "DueId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_team_billing_quotes_OwnerId_CreatedAt",
                schema: "billing",
                table: "team_billing_quotes",
                columns: new[] { "OwnerId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_team_billing_quotes_PriceId",
                schema: "billing",
                table: "team_billing_quotes",
                column: "PriceId");

            migrationBuilder.CreateIndex(
                name: "IX_team_billing_quotes_SourcePaymentId",
                schema: "billing",
                table: "team_billing_quotes",
                column: "SourcePaymentId");

            migrationBuilder.CreateIndex(
                name: "IX_team_billing_quotes_SourceSubscriptionId",
                schema: "billing",
                table: "team_billing_quotes",
                column: "SourceSubscriptionId");

            migrationBuilder.CreateIndex(
                name: "IX_team_billing_quotes_TeamId_CreatedAt",
                schema: "billing",
                table: "team_billing_quotes",
                columns: new[] { "TeamId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_team_platform_subscriptions_AcceptedPriceId",
                schema: "billing",
                table: "team_platform_subscriptions",
                column: "AcceptedPriceId");

            migrationBuilder.CreateIndex(
                name: "IX_team_platform_subscriptions_PaymentMethodId",
                schema: "billing",
                table: "team_platform_subscriptions",
                column: "PaymentMethodId");

            migrationBuilder.CreateIndex(
                name: "IX_team_platform_subscriptions_Status_PeriodEnd",
                schema: "billing",
                table: "team_platform_subscriptions",
                columns: new[] { "Status", "PeriodEnd" });

            migrationBuilder.AddForeignKey(
                name: "FK_team_memberships_teams_TeamId",
                schema: "billing",
                table: "team_memberships",
                column: "TeamId",
                principalSchema: "billing",
                principalTable: "teams",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_team_requests_teams_TeamId",
                schema: "billing",
                table: "team_requests",
                column: "TeamId",
                principalSchema: "billing",
                principalTable: "teams",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
            migrationBuilder.Sql("""
                CREATE TRIGGER protect_proration_credit BEFORE UPDATE OR DELETE ON billing.proration_credits FOR EACH ROW EXECUTE FUNCTION billing.reject_immutable_change();
                CREATE TRIGGER protect_team_audit BEFORE UPDATE OR DELETE ON billing.team_audit FOR EACH ROW EXECUTE FUNCTION billing.reject_immutable_change();
                CREATE FUNCTION billing.protect_team_quote() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
                BEGIN
                    IF TG_OP='DELETE' OR (to_jsonb(NEW)-'Status'-'DueId'-'ConfirmedAt') IS DISTINCT FROM (to_jsonb(OLD)-'Status'-'DueId'-'ConfirmedAt')
                       OR OLD."Status"='Confirmed' THEN RAISE EXCEPTION 'Team quote terms are immutable' USING ERRCODE='23514'; END IF;
                    RETURN NEW;
                END $$;
                REVOKE ALL ON FUNCTION billing.protect_team_quote() FROM PUBLIC;
                CREATE TRIGGER protect_team_quote BEFORE UPDATE OR DELETE ON billing.team_billing_quotes FOR EACH ROW EXECUTE FUNCTION billing.protect_team_quote();
                CREATE FUNCTION billing.check_team_capacity() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
                DECLARE t uuid; owner_id uuid; team_status text; seats integer; occupied integer; owners integer;
                BEGIN
                    IF TG_TABLE_NAME='teams' THEN t := COALESCE(NEW."Id",OLD."Id"); ELSE t := COALESCE(NEW."TeamId",OLD."TeamId"); END IF;
                    SELECT "OwnerId","Status" INTO owner_id,team_status FROM billing.teams WHERE "Id"=t;
                    IF NOT FOUND OR team_status='Dissolved' THEN RETURN NULL; END IF;
                    SELECT "PurchasedSeats" INTO seats FROM billing.team_platform_subscriptions WHERE "TeamId"=t;
                    SELECT count(*),count(*) FILTER (WHERE "Role"='Owner' AND "UserId"=owner_id) INTO occupied,owners
                      FROM billing.team_memberships WHERE "TeamId"=t AND "Status"='Active';
                    IF seats IS NULL OR occupied>seats OR owners<>1 THEN
                        RAISE EXCEPTION 'Team requires exactly one owner and sufficient purchased seats' USING ERRCODE='23514';
                    END IF;
                    RETURN NULL;
                END $$;
                REVOKE ALL ON FUNCTION billing.check_team_capacity() FROM PUBLIC;
                CREATE CONSTRAINT TRIGGER check_team_capacity AFTER INSERT OR UPDATE ON billing.teams DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing.check_team_capacity();
                CREATE CONSTRAINT TRIGGER check_member_capacity AFTER INSERT OR UPDATE OR DELETE ON billing.team_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing.check_team_capacity();
                CREATE CONSTRAINT TRIGGER check_subscription_capacity AFTER INSERT OR UPDATE OR DELETE ON billing.team_platform_subscriptions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing.check_team_capacity();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TRIGGER check_team_capacity ON billing.teams;
                DROP TRIGGER check_member_capacity ON billing.team_memberships;
                DROP TRIGGER check_subscription_capacity ON billing.team_platform_subscriptions;
                DROP FUNCTION billing.check_team_capacity();
                DROP FUNCTION billing.protect_team_quote() CASCADE;
                """);
            migrationBuilder.DropForeignKey(
                name: "FK_team_memberships_teams_TeamId",
                schema: "billing",
                table: "team_memberships");

            migrationBuilder.DropForeignKey(
                name: "FK_team_requests_teams_TeamId",
                schema: "billing",
                table: "team_requests");

            migrationBuilder.DropTable(
                name: "proration_credits",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "team_audit",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "team_platform_subscriptions",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "team_billing_quotes",
                schema: "billing");

            migrationBuilder.DropIndex(
                name: "IX_teams_DissolutionAt",
                schema: "billing",
                table: "teams");

            migrationBuilder.DropIndex(
                name: "IX_teams_OwnerId",
                schema: "billing",
                table: "teams");

            migrationBuilder.DropIndex(
                name: "IX_team_memberships_TeamId",
                schema: "billing",
                table: "team_memberships");

            migrationBuilder.DropIndex(
                name: "IX_team_memberships_UserId",
                schema: "billing",
                table: "team_memberships");

            migrationBuilder.DropCheckConstraint(
                name: "CK_team_member_role",
                schema: "billing",
                table: "team_memberships");

            migrationBuilder.DropCheckConstraint(
                name: "CK_team_member_status",
                schema: "billing",
                table: "team_memberships");

            migrationBuilder.DropIndex(
                name: "IX_payments_TeamId_CoachId_SettledAt",
                schema: "billing",
                table: "payments");

            migrationBuilder.DropIndex(
                name: "IX_payment_dues_ClientId_PeriodStart",
                schema: "billing",
                table: "payment_dues");

            migrationBuilder.DropIndex(
                name: "IX_payment_dues_TeamId_CoachId_DueAt",
                schema: "billing",
                table: "payment_dues");

            migrationBuilder.DropIndex(
                name: "IX_orders_TeamId_CoachId_CreatedAt",
                schema: "billing",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "Description",
                schema: "billing",
                table: "teams");

            migrationBuilder.DropColumn(
                name: "DissolutionAt",
                schema: "billing",
                table: "teams");

            migrationBuilder.DropColumn(
                name: "OwnershipExpiresAt",
                schema: "billing",
                table: "teams");

            migrationBuilder.DropColumn(
                name: "PendingOwnerId",
                schema: "billing",
                table: "teams");

            migrationBuilder.DropColumn(
                name: "Status",
                schema: "billing",
                table: "teams");

            migrationBuilder.DropColumn(
                name: "Version",
                schema: "billing",
                table: "teams");

            migrationBuilder.DropColumn(
                name: "DecidedAt",
                schema: "billing",
                table: "team_requests");

            migrationBuilder.DropColumn(
                name: "ExpiresAt",
                schema: "billing",
                table: "team_requests");

            migrationBuilder.DropColumn(
                name: "InviterId",
                schema: "billing",
                table: "team_requests");

            migrationBuilder.DropColumn(
                name: "Role",
                schema: "billing",
                table: "team_requests");

            migrationBuilder.DropColumn(
                name: "EndedAt",
                schema: "billing",
                table: "team_memberships");

            migrationBuilder.DropColumn(
                name: "Role",
                schema: "billing",
                table: "team_memberships");

            migrationBuilder.DropColumn(
                name: "Status",
                schema: "billing",
                table: "team_memberships");

            migrationBuilder.DropColumn(
                name: "TeamClientCaseId",
                schema: "billing",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "TeamId",
                schema: "billing",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "TeamClientCaseId",
                schema: "billing",
                table: "payment_dues");

            migrationBuilder.DropColumn(
                name: "TeamId",
                schema: "billing",
                table: "payment_dues");

            migrationBuilder.DropColumn(
                name: "TeamClientCaseId",
                schema: "billing",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "TeamId",
                schema: "billing",
                table: "orders");

            migrationBuilder.CreateIndex(
                name: "IX_teams_OwnerId",
                schema: "billing",
                table: "teams",
                column: "OwnerId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_team_memberships_UserId",
                schema: "billing",
                table: "team_memberships",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_payment_dues_ClientId_PeriodStart",
                schema: "billing",
                table: "payment_dues",
                columns: new[] { "ClientId", "PeriodStart" },
                unique: true,
                filter: "\"Context\" = 'Platform'");

            migrationBuilder.AddForeignKey(
                name: "FK_team_memberships_teams_TeamId",
                schema: "billing",
                table: "team_memberships",
                column: "TeamId",
                principalSchema: "billing",
                principalTable: "teams",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_team_requests_teams_TeamId",
                schema: "billing",
                table: "team_requests",
                column: "TeamId",
                principalSchema: "billing",
                principalTable: "teams",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
