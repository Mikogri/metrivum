using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Accounts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ClientAccounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE OR REPLACE FUNCTION accounts.guard_role_assignment() RETURNS trigger
                LANGUAGE plpgsql SET search_path = '' AS $$
                BEGIN
                    IF current_user = 'trainflow_api' AND NEW."Role" NOT IN ('Coach', 'Client') THEN
                        RAISE EXCEPTION 'API may only provision Coach or Client roles' USING ERRCODE = '42501';
                    END IF;
                    RETURN NEW;
                END $$;
                REVOKE ALL ON FUNCTION accounts.guard_role_assignment() FROM PUBLIC;
                """);

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                schema: "accounts",
                table: "profiles",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "PhoneVisibleToCoach",
                schema: "accounts",
                table: "profiles",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE OR REPLACE FUNCTION accounts.guard_role_assignment() RETURNS trigger
                LANGUAGE plpgsql SET search_path = '' AS $$
                BEGIN
                    IF current_user = 'trainflow_api' AND NEW."Role" <> 'Coach' THEN
                        RAISE EXCEPTION 'API may only provision the Coach role' USING ERRCODE = '42501';
                    END IF;
                    RETURN NEW;
                END $$;
                REVOKE ALL ON FUNCTION accounts.guard_role_assignment() FROM PUBLIC;
                """);
            migrationBuilder.DropColumn(
                name: "Phone",
                schema: "accounts",
                table: "profiles");

            migrationBuilder.DropColumn(
                name: "PhoneVisibleToCoach",
                schema: "accounts",
                table: "profiles");
        }
    }
}
