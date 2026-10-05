using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Accounts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class GuardRuntimeRoleAssignment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE FUNCTION accounts.guard_role_assignment() RETURNS trigger
                LANGUAGE plpgsql SET search_path = '' AS $$
                BEGIN
                    IF current_user = 'trainflow_api' AND NEW."Role" <> 'Coach' THEN
                        RAISE EXCEPTION 'API may only provision the Coach role' USING ERRCODE = '42501';
                    END IF;
                    RETURN NEW;
                END $$;
                REVOKE ALL ON FUNCTION accounts.guard_role_assignment() FROM PUBLIC;
                CREATE TRIGGER guard_role_assignment BEFORE INSERT ON accounts.user_roles
                FOR EACH ROW EXECUTE FUNCTION accounts.guard_role_assignment();
                """);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TRIGGER guard_role_assignment ON accounts.user_roles;
                DROP FUNCTION accounts.guard_role_assignment();
                """);

        }
    }
}
