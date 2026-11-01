using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Training.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ProtectPlanPurchases : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE training.purchases ADD CONSTRAINT "CK_purchase_delivery" CHECK (("PlanId" IS NULL) = ("DeliveredAt" IS NULL));
                ALTER TABLE training.purchases ADD CONSTRAINT "CK_purchase_parties" CHECK ("BuyerId" <> "SellerId");
                CREATE FUNCTION training.protect_purchase() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
                BEGIN
                    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Purchase receipts cannot be deleted' USING ERRCODE='23514'; END IF;
                    IF TG_OP='INSERT' THEN
                        IF NEW."PlanId" IS NOT NULL THEN RAISE EXCEPTION 'Purchase starts pending' USING ERRCODE='23514'; END IF;
                        RETURN NEW;
                    END IF;
                    IF OLD."PlanId" IS NOT NULL OR (to_jsonb(NEW)-ARRAY['PlanId','DeliveredAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['PlanId','DeliveredAt']) THEN
                        RAISE EXCEPTION 'Purchase terms and completed delivery are immutable' USING ERRCODE='23514';
                    END IF;
                    IF NEW."PlanId" IS NULL OR NEW."DeliveredAt" IS NULL OR NOT EXISTS(SELECT 1 FROM training.plans p WHERE p."Id"=NEW."PlanId" AND p."OwnerId"=NEW."BuyerId") THEN
                        RAISE EXCEPTION 'Delivery must create a personal buyer-owned plan' USING ERRCODE='23514';
                    END IF;
                    RETURN NEW;
                END $$;
                CREATE TRIGGER protect_purchase BEFORE INSERT OR UPDATE OR DELETE ON training.purchases FOR EACH ROW EXECUTE FUNCTION training.protect_purchase();
                """);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TRIGGER protect_purchase ON training.purchases;
                DROP FUNCTION training.protect_purchase();
                ALTER TABLE training.purchases DROP CONSTRAINT "CK_purchase_delivery";
                ALTER TABLE training.purchases DROP CONSTRAINT "CK_purchase_parties";
                """);

        }
    }
}
