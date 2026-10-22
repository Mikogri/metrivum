-- Development upgrade exported from the two PagedTeamReadIndexes EF migrations.
-- Apply only after verifying the development target and these module baselines.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL ROLE trainflow_migrator;
DO $$ BEGIN
    IF (SELECT max("MigrationId") FROM coaching."__EFMigrationsHistory") IS DISTINCT FROM '20261012161041_OptionalApplicationForm'
       OR (SELECT max("MigrationId") FROM billing."__EFMigrationsHistory") IS DISTINCT FROM '20261009234144_PlanPurchaseOrders' THEN
        RAISE EXCEPTION 'Unexpected module history for paged team index upgrade';
    END IF;
END $$;
CREATE INDEX "IX_TeamClientCases_TeamId_CreatedAt_Id"
    ON coaching."TeamClientCases" ("TeamId", "CreatedAt" DESC, "Id");
CREATE INDEX "IX_ClientTransferRequests_ClientId_CreatedAt_Id"
    ON coaching."ClientTransferRequests" ("ClientId", "CreatedAt" DESC, "Id");
CREATE INDEX "IX_ClientTransferRequests_TeamId_CreatedAt_Id"
    ON coaching."ClientTransferRequests" ("TeamId", "CreatedAt" DESC, "Id");
INSERT INTO coaching."__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261020181755_PagedTeamReadIndexes', '10.0.12');
CREATE INDEX "IX_team_memberships_TeamId_JoinedAt_UserId"
    ON billing.team_memberships ("TeamId", "JoinedAt", "UserId") WHERE "Status" = 'Active';
INSERT INTO billing."__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261020181746_PagedTeamReadIndexes', '10.0.12');
COMMIT;
