using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.CheckIns.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PreserveCheckInAssignmentSource : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AssignmentGroupsJson",
                schema: "checkins",
                table: "Requests",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AssignmentSource",
                schema: "checkins",
                table: "Requests",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);
            migrationBuilder.Sql("""
                CREATE FUNCTION checkins.protect_assignment_source() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF ROW(NEW."AssignmentSource", NEW."AssignmentGroupsJson") IS DISTINCT FROM ROW(OLD."AssignmentSource", OLD."AssignmentGroupsJson") THEN
                        RAISE EXCEPTION 'Issued assignment sources are immutable' USING ERRCODE = '23514';
                    END IF;
                    RETURN NEW;
                END $$;
                REVOKE ALL ON FUNCTION checkins.protect_assignment_source() FROM PUBLIC;
                CREATE TRIGGER protect_assignment_source BEFORE UPDATE ON checkins."Requests"
                    FOR EACH ROW EXECUTE FUNCTION checkins.protect_assignment_source();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER protect_assignment_source ON checkins.\"Requests\"; DROP FUNCTION checkins.protect_assignment_source();");
            migrationBuilder.DropColumn(
                name: "AssignmentGroupsJson",
                schema: "checkins",
                table: "Requests");

            migrationBuilder.DropColumn(
                name: "AssignmentSource",
                schema: "checkins",
                table: "Requests");
        }
    }
}
