using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Coaching.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TeamClientGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "TeamId",
                schema: "coaching",
                table: "Groups",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Groups_TeamId_CoachId_Archived_Name",
                schema: "coaching",
                table: "Groups",
                columns: new[] { "TeamId", "CoachId", "Archived", "Name" });
            migrationBuilder.Sql("""
                CREATE FUNCTION coaching.require_matching_group_scope() RETURNS trigger
                LANGUAGE plpgsql SET search_path = pg_catalog AS $$
                BEGIN
                    IF (SELECT "TeamId" FROM coaching."Groups" WHERE "Id"=NEW."GroupId") IS DISTINCT FROM
                       (SELECT "TeamId" FROM coaching."Relationships" WHERE "Id"=NEW."RelationshipId") THEN
                        RAISE EXCEPTION 'Client groups and relationships must have the same ownership scope' USING ERRCODE='23514';
                    END IF;
                    RETURN NEW;
                END;
                $$;
                CREATE TRIGGER memberships_scope BEFORE INSERT OR UPDATE ON coaching."Memberships"
                    FOR EACH ROW EXECUTE FUNCTION coaching.require_matching_group_scope();
                CREATE FUNCTION coaching.require_immutable_group_scope() RETURNS trigger
                LANGUAGE plpgsql SET search_path = pg_catalog AS $$
                BEGIN
                    IF NEW."TeamId" IS DISTINCT FROM OLD."TeamId" THEN
                        RAISE EXCEPTION 'Client group ownership scope is immutable' USING ERRCODE='23514';
                    END IF;
                    RETURN NEW;
                END;
                $$;
                CREATE TRIGGER group_scope_immutable BEFORE UPDATE OF "TeamId" ON coaching."Groups"
                    FOR EACH ROW EXECUTE FUNCTION coaching.require_immutable_group_scope();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TRIGGER memberships_scope ON coaching."Memberships";
                DROP TRIGGER group_scope_immutable ON coaching."Groups";
                DROP FUNCTION coaching.require_matching_group_scope();
                DROP FUNCTION coaching.require_immutable_group_scope();
                """);
            migrationBuilder.DropIndex(
                name: "IX_Groups_TeamId_CoachId_Archived_Name",
                schema: "coaching",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "TeamId",
                schema: "coaching",
                table: "Groups");
        }
    }
}
