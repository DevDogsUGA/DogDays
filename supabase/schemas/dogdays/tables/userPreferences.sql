-- One row per member. `userId` is this project's auth user; `legacyUserId` is
-- the DevDogs platform user id the row was copied from (see legacyImports and
-- claim_legacy_data). A copied row has no `userId` until its owner signs in.
CREATE TABLE "dogdays"."userPreferences" (
  "id"                    uuid    NOT NULL DEFAULT gen_random_uuid(),
  "userId"                uuid,
  "legacyUserId"          uuid,
  "currentAcademicPeriod" integer,
  "colorScheme"           text,
  CONSTRAINT "userPreferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "userPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT "userPreferences_userId_key" UNIQUE ("userId"),
  CONSTRAINT "userPreferences_legacyUserId_key" UNIQUE ("legacyUserId"),
  CONSTRAINT "userPreferences_owner_check" CHECK ("userId" IS NOT NULL OR "legacyUserId" IS NOT NULL)
);

ALTER TABLE "dogdays"."userPreferences" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_prefs" ON "dogdays"."userPreferences"
  FOR ALL
  TO "authenticated"
  USING ((SELECT auth.uid()) = "userId")
  WITH CHECK ((SELECT auth.uid()) = "userId");

-- `legacyUserId` is deliberately not in the column lists: only the copy job
-- (service_role) writes it. If members could, one could squat another
-- member's copied row and make the copy skip it.
GRANT SELECT ON TABLE "dogdays"."userPreferences" TO "authenticated";
GRANT INSERT ("userId", "currentAcademicPeriod", "colorScheme") ON TABLE "dogdays"."userPreferences" TO "authenticated";
GRANT UPDATE ("userId", "currentAcademicPeriod", "colorScheme") ON TABLE "dogdays"."userPreferences" TO "authenticated";
GRANT DELETE ON TABLE "dogdays"."userPreferences" TO "authenticated";
GRANT ALL ON TABLE "dogdays"."userPreferences" TO "service_role";
