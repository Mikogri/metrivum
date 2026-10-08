-- Run as a development administrator. All fixture rows are rolled back.
BEGIN;
SET LOCAL ROLE trainflow_api;
DO $$
DECLARE team_id uuid:=gen_random_uuid(); owner_id uuid:=gen_random_uuid(); price_id uuid:=gen_random_uuid();
    case_id uuid:=gen_random_uuid(); client_id uuid:=gen_random_uuid(); relationship_id uuid:=gen_random_uuid();
    group_id uuid:=gen_random_uuid();
BEGIN
    INSERT INTO billing.plan_prices ("Id","PlanId","Version","Amount","Currency","TermsVersion","CreatedAt")
    VALUES (price_id,'Team','runtime-'||price_id,20,'USD','runtime',now());
    INSERT INTO billing.teams ("Id","OwnerId","Name","CreatedAt","Status","Description","Version")
    VALUES (team_id,owner_id,'Runtime verification',now(),'Active','',1);
    INSERT INTO billing.team_platform_subscriptions ("TeamId","AcceptedPriceId","PurchasedSeats","PeriodStart","PeriodEnd","AutoRenew","Status","Version")
    VALUES (team_id,price_id,1,now(),now()+interval '1 month',false,'Active',1);
    INSERT INTO billing.team_memberships ("TeamId","UserId","JoinedAt","Role","Status")
    VALUES (team_id,owner_id,now(),'Owner','Active');
    INSERT INTO coaching."TeamClientCases" ("Id","TeamId","ClientId","Status","CreatedAt","Version")
    VALUES (case_id,team_id,client_id,'Active',now(),1);
    INSERT INTO coaching."Relationships" ("Id","CoachId","ClientId","WorkspaceId","Status","ActivationSource","StartedAt","CreatedAt","UpdatedAt","Version","TeamId","TeamClientCaseId")
    VALUES (relationship_id,owner_id,client_id,owner_id,'Active','TeamConsent',now(),now(),now(),1,team_id,case_id);
    INSERT INTO coaching."Groups" ("Id","CoachId","WorkspaceId","Name","Description","Color","Archived","CreatedAt","UpdatedAt","Version","TeamId")
    VALUES (group_id,owner_id,owner_id,'Runtime Team group','','#123456',false,now(),now(),1,team_id);
    INSERT INTO coaching."Memberships" ("GroupId","RelationshipId","CoachId","WorkspaceId","CreatedAt")
    VALUES (group_id,relationship_id,owner_id,owner_id,now());
    UPDATE billing.teams SET "Description"='Verified',"Version"=2 WHERE "Id"=team_id;
    IF NOT EXISTS (SELECT FROM billing.teams WHERE "Id"=team_id AND "Description"='Verified')
        OR NOT EXISTS (SELECT FROM coaching."Memberships" WHERE "GroupId"=group_id) THEN
        RAISE EXCEPTION 'Team runtime write/read failed';
    END IF;
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
SELECT 'Team runtime write/read and deferred constraints verified; fixture rolled back' AS verification;
