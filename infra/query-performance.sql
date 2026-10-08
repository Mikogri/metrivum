-- Development upgrade, exported from the three QueryPerformanceIndexes EF migrations.
-- EF history remains authoritative. Additive indexes only; no application rows change.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL ROLE trainflow_migrator;
DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM notifications."__EFMigrationsHistory" WHERE "MigrationId"='20261008083449_InitialNotifications')
       OR NOT EXISTS (SELECT FROM billing."__EFMigrationsHistory" WHERE "MigrationId"='20261008084224_PlatformBillingGuards')
       OR NOT EXISTS (SELECT FROM messaging."__EFMigrationsHistory" WHERE "MigrationId"='20261007153423_InitialMessaging') THEN
        RAISE EXCEPTION 'Query performance upgrade requires the Stage 04 baseline';
    END IF;
END $$;

CREATE INDEX "IX_Notifications_PendingDelivery" ON notifications."Notifications" ("AvailableAt")
    WHERE "DeliveredAt" IS NULL AND NOT "Cancelled";
CREATE INDEX "IX_Notifications_Unread" ON notifications."Notifications" ("RecipientUserId", "AvailableAt")
    WHERE "ReadAt" IS NULL AND NOT "Cancelled";
INSERT INTO notifications."__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261008103734_QueryPerformanceIndexes', '10.0.12');

CREATE INDEX "IX_Requests_SenderUserId_CreatedAt" ON messaging."Requests" ("SenderUserId", "CreatedAt");
INSERT INTO messaging."__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261008103917_QueryPerformanceIndexes', '10.0.12');

CREATE INDEX "IX_payments_CoachId_SettledAt" ON billing.payments ("CoachId", "SettledAt")
    WHERE "Context" = 'CoachingService';
CREATE INDEX "IX_payment_dues_CoachId_DueAt" ON billing.payment_dues ("CoachId", "DueAt")
    WHERE "Context" = 'CoachingService' AND "Status" = 'AwaitingPayment';
INSERT INTO billing."__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261008103805_QueryPerformanceIndexes', '10.0.12');
COMMIT;
