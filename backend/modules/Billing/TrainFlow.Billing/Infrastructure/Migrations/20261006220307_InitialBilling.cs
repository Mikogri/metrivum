using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialBilling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "billing");

            migrationBuilder.CreateTable(
                name: "orders",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ServiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    BillingOptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SelectedSessionCount = table.Column<int>(type: "integer", nullable: true),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    OptionSnapshot = table.Column<string>(type: "jsonb", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    FeeRate = table.Column<decimal>(type: "numeric(7,6)", precision: 7, scale: 6, nullable: false),
                    FeeAmount = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    CoachNetAmount = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    SettlementMode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_orders", x => x.Id);
                    table.CheckConstraint("CK_order_money", "\"Amount\" >= 0 AND \"FeeRate\" BETWEEN 0 AND 1 AND \"FeeAmount\" >= 0 AND \"CoachNetAmount\" >= 0 AND \"Amount\" = \"FeeAmount\" + \"CoachNetAmount\"");
                });

            migrationBuilder.CreateTable(
                name: "payment_methods",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Label = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Token = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_payment_methods", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "payment_dues",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    ServiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Sequence = table.Column<int>(type: "integer", nullable: false),
                    PeriodStart = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PeriodEnd = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    FeeRate = table.Column<decimal>(type: "numeric(7,6)", precision: 7, scale: 6, nullable: false),
                    FeeAmount = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    CoachNetAmount = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    SettlementMode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    SettledAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    SettledBy = table.Column<Guid>(type: "uuid", nullable: true),
                    SettlementSource = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_payment_dues", x => x.Id);
                    table.CheckConstraint("CK_due_money", "\"Amount\" >= 0 AND \"FeeRate\" BETWEEN 0 AND 1 AND \"FeeAmount\" >= 0 AND \"CoachNetAmount\" >= 0 AND \"Amount\" = \"FeeAmount\" + \"CoachNetAmount\"");
                    table.CheckConstraint("CK_due_sequence", "\"Sequence\" >= 0");
                    table.ForeignKey(
                        name: "FK_payment_dues_orders_OrderId",
                        column: x => x.OrderId,
                        principalSchema: "billing",
                        principalTable: "orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "subscriptions",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    ServiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Anchor = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PeriodCount = table.Column<int>(type: "integer", nullable: false),
                    PeriodUnit = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    NextSequence = table.Column<int>(type: "integer", nullable: false),
                    NextPeriodAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    EndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RetryAfter = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_subscriptions", x => x.Id);
                    table.CheckConstraint("CK_subscription_period", "\"NextSequence\" >= 1 AND ((\"PeriodUnit\" = 'Week' AND \"PeriodCount\" BETWEEN 1 AND 52) OR (\"PeriodUnit\" = 'Month' AND \"PeriodCount\" BETWEEN 1 AND 12) OR (\"PeriodUnit\" = 'Year' AND \"PeriodCount\" = 1))");
                    table.ForeignKey(
                        name: "FK_subscriptions_orders_OrderId",
                        column: x => x.OrderId,
                        principalSchema: "billing",
                        principalTable: "orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "payment_attempts",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DueId = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentMethodId = table.Column<Guid>(type: "uuid", nullable: true),
                    IdempotencyKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    FailureCode = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    ProviderReference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_payment_attempts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_payment_attempts_payment_dues_DueId",
                        column: x => x.DueId,
                        principalSchema: "billing",
                        principalTable: "payment_dues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_payment_attempts_payment_methods_PaymentMethodId",
                        column: x => x.PaymentMethodId,
                        principalSchema: "billing",
                        principalTable: "payment_methods",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "renewal_failures",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SubscriptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Sequence = table.Column<int>(type: "integer", nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    Code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    LastAttemptAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ResolvedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_renewal_failures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_renewal_failures_subscriptions_SubscriptionId",
                        column: x => x.SubscriptionId,
                        principalSchema: "billing",
                        principalTable: "subscriptions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "payments",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DueId = table.Column<Guid>(type: "uuid", nullable: false),
                    AttemptId = table.Column<Guid>(type: "uuid", nullable: true),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    GrossAmount = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    FeeRate = table.Column<decimal>(type: "numeric(7,6)", precision: 7, scale: 6, nullable: false),
                    FeeAmount = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    CoachNetAmount = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    Mode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Source = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    IdempotencyKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: true),
                    SettledAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_payments", x => x.Id);
                    table.CheckConstraint("CK_payment_money", "\"GrossAmount\" >= 0 AND \"FeeRate\" BETWEEN 0 AND 1 AND \"FeeAmount\" >= 0 AND \"CoachNetAmount\" >= 0 AND \"GrossAmount\" = \"FeeAmount\" + \"CoachNetAmount\"");
                    table.ForeignKey(
                        name: "FK_payments_payment_attempts_AttemptId",
                        column: x => x.AttemptId,
                        principalSchema: "billing",
                        principalTable: "payment_attempts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_payments_payment_dues_DueId",
                        column: x => x.DueId,
                        principalSchema: "billing",
                        principalTable: "payment_dues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "transactions",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    AttemptId = table.Column<Guid>(type: "uuid", nullable: false),
                    Provider = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ProviderReference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_transactions", x => x.Id);
                    table.CheckConstraint("CK_transaction_amount", "\"Amount\" > 0");
                    table.ForeignKey(
                        name: "FK_transactions_payment_attempts_AttemptId",
                        column: x => x.AttemptId,
                        principalSchema: "billing",
                        principalTable: "payment_attempts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_transactions_payments_PaymentId",
                        column: x => x.PaymentId,
                        principalSchema: "billing",
                        principalTable: "payments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_orders_ClientId_CreatedAt",
                schema: "billing",
                table: "orders",
                columns: new[] { "ClientId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_orders_CoachId_RelationshipId_CreatedAt",
                schema: "billing",
                table: "orders",
                columns: new[] { "CoachId", "RelationshipId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_orders_ServiceId",
                schema: "billing",
                table: "orders",
                column: "ServiceId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_payment_attempts_DueId_IdempotencyKey",
                schema: "billing",
                table: "payment_attempts",
                columns: new[] { "DueId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_payment_attempts_PaymentMethodId",
                schema: "billing",
                table: "payment_attempts",
                column: "PaymentMethodId");

            migrationBuilder.CreateIndex(
                name: "IX_payment_dues_ClientId_Status_DueAt",
                schema: "billing",
                table: "payment_dues",
                columns: new[] { "ClientId", "Status", "DueAt" });

            migrationBuilder.CreateIndex(
                name: "IX_payment_dues_CoachId_RelationshipId_DueAt",
                schema: "billing",
                table: "payment_dues",
                columns: new[] { "CoachId", "RelationshipId", "DueAt" });

            migrationBuilder.CreateIndex(
                name: "IX_payment_dues_OrderId_Sequence",
                schema: "billing",
                table: "payment_dues",
                columns: new[] { "OrderId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_payment_methods_ClientId_Active",
                schema: "billing",
                table: "payment_methods",
                columns: new[] { "ClientId", "Active" });

            migrationBuilder.CreateIndex(
                name: "IX_payment_methods_Token",
                schema: "billing",
                table: "payment_methods",
                column: "Token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_payments_AttemptId",
                schema: "billing",
                table: "payments",
                column: "AttemptId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_payments_CoachId_Currency_SettledAt",
                schema: "billing",
                table: "payments",
                columns: new[] { "CoachId", "Currency", "SettledAt" });

            migrationBuilder.CreateIndex(
                name: "IX_payments_DueId",
                schema: "billing",
                table: "payments",
                column: "DueId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_renewal_failures_SubscriptionId_Sequence",
                schema: "billing",
                table: "renewal_failures",
                columns: new[] { "SubscriptionId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_subscriptions_Active_NextPeriodAt",
                schema: "billing",
                table: "subscriptions",
                columns: new[] { "Active", "NextPeriodAt" });

            migrationBuilder.CreateIndex(
                name: "IX_subscriptions_OrderId",
                schema: "billing",
                table: "subscriptions",
                column: "OrderId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_subscriptions_ServiceId",
                schema: "billing",
                table: "subscriptions",
                column: "ServiceId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_transactions_AttemptId",
                schema: "billing",
                table: "transactions",
                column: "AttemptId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_transactions_PaymentId",
                schema: "billing",
                table: "transactions",
                column: "PaymentId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_transactions_Provider_ProviderReference",
                schema: "billing",
                table: "transactions",
                columns: new[] { "Provider", "ProviderReference" },
                unique: true);
            migrationBuilder.Sql("""
                CREATE FUNCTION billing.reject_immutable_change() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
                BEGIN RAISE EXCEPTION 'Financial snapshots and settlements are immutable' USING ERRCODE = '23514'; END $$;
                REVOKE ALL ON FUNCTION billing.reject_immutable_change() FROM PUBLIC;
                CREATE TRIGGER immutable_order BEFORE UPDATE OR DELETE ON billing.orders FOR EACH ROW EXECUTE FUNCTION billing.reject_immutable_change();
                CREATE TRIGGER immutable_payment BEFORE UPDATE OR DELETE ON billing.payments FOR EACH ROW EXECUTE FUNCTION billing.reject_immutable_change();
                CREATE TRIGGER immutable_transaction BEFORE UPDATE OR DELETE ON billing.transactions FOR EACH ROW EXECUTE FUNCTION billing.reject_immutable_change();
                CREATE FUNCTION billing.protect_due() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
                BEGIN
                    IF OLD."Status" <> 'AwaitingPayment' THEN RAISE EXCEPTION 'Settled dues are immutable' USING ERRCODE = '23514'; END IF;
                    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Financial dues cannot be deleted' USING ERRCODE = '23514'; END IF;
                    IF NEW."OrderId" <> OLD."OrderId" OR NEW."ServiceId" <> OLD."ServiceId" OR NEW."RelationshipId" <> OLD."RelationshipId" OR NEW."CoachId" <> OLD."CoachId" OR NEW."ClientId" <> OLD."ClientId" OR NEW."Amount" <> OLD."Amount" OR NEW."Currency" <> OLD."Currency" OR NEW."Sequence" <> OLD."Sequence" OR NEW."DueAt" <> OLD."DueAt" OR NEW."PeriodStart" <> OLD."PeriodStart" OR NEW."PeriodEnd" IS DISTINCT FROM OLD."PeriodEnd" THEN RAISE EXCEPTION 'Due identity and gross terms are immutable' USING ERRCODE = '23514'; END IF;
                    RETURN NEW;
                END $$;
                REVOKE ALL ON FUNCTION billing.protect_due() FROM PUBLIC;
                CREATE TRIGGER protect_payment_due BEFORE UPDATE OR DELETE ON billing.payment_dues FOR EACH ROW EXECUTE FUNCTION billing.protect_due();
                ALTER TABLE billing.payment_dues ADD CONSTRAINT "CK_due_status" CHECK (("Status" = 'AwaitingPayment' AND "SettledAt" IS NULL) OR ("Status" IN ('Paid','PaidExternally','Free') AND "SettledAt" IS NOT NULL));
                ALTER TABLE billing.payment_dues ADD CONSTRAINT "CK_external_fee" CHECK ("SettlementMode" <> 'External' OR ("FeeRate" = 0 AND "FeeAmount" = 0));
                ALTER TABLE billing.payments ADD CONSTRAINT "CK_external_payment_fee" CHECK ("Mode" <> 'External' OR ("FeeRate" = 0 AND "FeeAmount" = 0));
                ALTER TABLE billing.payment_methods ADD CONSTRAINT "CK_simulated_method_token" CHECK ("Token" LIKE 'sim_success_%' OR "Token" LIKE 'sim_decline_%');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "renewal_failures",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "transactions",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "subscriptions",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "payments",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "payment_attempts",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "payment_dues",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "payment_methods",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "orders",
                schema: "billing");
            migrationBuilder.Sql("DROP FUNCTION billing.protect_due(); DROP FUNCTION billing.reject_immutable_change();");
        }
    }
}
