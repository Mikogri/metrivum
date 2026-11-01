using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
namespace Metrivum.Billing.Infrastructure.Migrations;

public partial class SafeOverSeatTransitions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
                CREATE OR REPLACE FUNCTION billing.check_team_capacity() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
                DECLARE t uuid; owner_id uuid; team_status text; seats integer; occupied integer; owners integer; admission boolean := false;
                BEGIN
                    IF TG_TABLE_NAME='teams' THEN t := COALESCE(NEW."Id",OLD."Id"); ELSE t := COALESCE(NEW."TeamId",OLD."TeamId"); END IF;
                    PERFORM pg_advisory_xact_lock(hashtextextended('team:' || t::text, 0));
                    SELECT "OwnerId","Status" INTO owner_id,team_status FROM billing.teams WHERE "Id"=t;
                    IF NOT FOUND OR team_status='Dissolved' THEN RETURN NULL; END IF;
                    SELECT "PurchasedSeats" INTO seats FROM billing.team_platform_subscriptions WHERE "TeamId"=t;
                    SELECT count(*),count(*) FILTER (WHERE "Role"='Owner' AND "UserId"=owner_id) INTO occupied,owners
                        FROM billing.team_memberships WHERE "TeamId"=t AND "Status"='Active';
                    IF TG_TABLE_NAME='team_memberships' AND TG_OP <> 'DELETE' THEN
                        IF NEW."Status"='Active' AND EXISTS (SELECT 1 FROM billing.team_memberships WHERE "TeamId"=t AND "UserId"=NEW."UserId" AND "Status"='Active') THEN
                            IF TG_OP='INSERT' THEN admission := true;
                            ELSE admission := OLD."Status" <> 'Active' OR OLD."TeamId" IS DISTINCT FROM NEW."TeamId";
                            END IF;
                        END IF;
                    END IF;
                    IF seats IS NULL OR owners<>1 OR (admission AND occupied>seats) THEN
                        RAISE EXCEPTION 'Team requires exactly one owner; new memberships require available seats' USING ERRCODE='23514';
                    END IF;
                    -- A paid-period downgrade may leave retained members over the new allowance.
                    -- Existing members can leave/change roles; only new admission is blocked.
                    RETURN NULL;
                END $$;
                """);
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
                CREATE OR REPLACE FUNCTION billing.check_team_capacity() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
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
                """);
    }
}