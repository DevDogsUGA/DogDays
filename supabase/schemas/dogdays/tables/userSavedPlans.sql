-- A saved schedule: the CRNs the member picked for one term. A copied plan
-- keeps the id it had on the platform, so the copy job can run twice safely.
CREATE TABLE "dogdays"."userSavedPlans" (
  "id"             uuid        NOT NULL DEFAULT gen_random_uuid(),
  "userId"         uuid,
  "legacyUserId"   uuid,
  "academicPeriod" integer     NOT NULL,
  "title"          text        NOT NULL,
  "crns"           integer[]   NOT NULL,
  -- The catalog's course ids the plan was generated from. The catalog has no
  -- lookup by CRN, so this is how a plan finds its sections again. Empty on
  -- plans copied from the old app, which fall back to the term's draft.
  "courseIds"      integer[]   NOT NULL DEFAULT '{}'::integer[],
  "pinned"         boolean     NOT NULL DEFAULT false,
  "shareId"        uuid,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "userSavedPlans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "userSavedPlans_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT "userSavedPlans_owner_check" CHECK ("userId" IS NOT NULL OR "legacyUserId" IS NOT NULL),
  CONSTRAINT "userSavedPlans_shareId_key" UNIQUE ("shareId")
);

CREATE INDEX "userSavedPlans_userId_idx" ON "dogdays"."userSavedPlans" ("userId");

CREATE INDEX "userSavedPlans_legacyUserId_idx" ON "dogdays"."userSavedPlans" ("legacyUserId");

ALTER TABLE "dogdays"."userSavedPlans" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_plans" ON "dogdays"."userSavedPlans"
  FOR ALL
  TO "authenticated"
  USING ((SELECT auth.uid()) = "userId")
  WITH CHECK ((SELECT auth.uid()) = "userId");

GRANT SELECT ON TABLE "dogdays"."userSavedPlans" TO "authenticated";
-- `id` is insertable so a signed-out visitor's local plans keep their ids when
-- they sign in (the merge is then safe to run twice).
GRANT INSERT ("id", "userId", "academicPeriod", "title", "crns", "courseIds", "pinned", "shareId")
  ON TABLE "dogdays"."userSavedPlans" TO "authenticated";
GRANT UPDATE ("userId", "academicPeriod", "title", "crns", "courseIds", "pinned", "shareId", "updatedAt")
  ON TABLE "dogdays"."userSavedPlans" TO "authenticated";
GRANT DELETE ON TABLE "dogdays"."userSavedPlans" TO "authenticated";
GRANT ALL ON TABLE "dogdays"."userSavedPlans" TO "service_role";
