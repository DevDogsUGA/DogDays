-- Every message the receiver has accepted, by its webhook id. A row here is
-- what makes a replay a duplicate. It is written in the same transaction as
-- the change it records (dogdays.apply_moderation_event), so a failed apply
-- leaves no row and the platform's retry is applied, not ignored.
--
-- Account deletion: the payload of a `user.delete` has its free-text reason
-- nulled before it is stored. It holds the platform user id, which the platform
-- has already deleted, and nothing that points at a DogDays member. Earlier ban
-- and suspend payloads keep their reasons (best effort). Nothing here refers to
-- auth.users, so a member's deletion never touches this table.
CREATE TABLE "moderation"."events" (
  "id"         text        NOT NULL,
  "type"       text        NOT NULL,
  "itemKey"    text        NOT NULL,
  "decidedAt"  timestamptz NOT NULL,
  "outcome"    text        NOT NULL DEFAULT 'applied',
  "payload"    jsonb       NOT NULL,
  "receivedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "events_outcome_valid" CHECK ("outcome" IN ('applied', 'stale'))
);

ALTER TABLE "moderation"."events" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "moderation"."events" FROM PUBLIC, "anon", "authenticated";
GRANT SELECT, INSERT, UPDATE ON TABLE "moderation"."events" TO "service_role";

COMMENT ON TABLE "moderation"."events" IS 'Moderation messages received from the platform, keyed by webhook id.';
