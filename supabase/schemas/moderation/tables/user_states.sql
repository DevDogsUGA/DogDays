-- Platform users who are suspended, banned or deleted, keyed by their DEVDOGS
-- user id (the subject of their custom:devdogsuga identity), not by DogDays'
-- own auth id. A ban can arrive before the person ever signs in here and must
-- still bite when they do. Deleting a DogDays account does not lift a ban.
--
-- Account deletion (`user.delete`): the row stays with state 'deleted' and no
-- reason. It holds only the platform's own user id, which the platform has
-- already deleted, and it keeps a late or replayed message about that id from
-- being treated as a new person. The DogDays auth user and everything on it is
-- removed by the receiver (admin API; every member table cascades), and the
-- unclaimed copies keyed by the platform id (legacyUserId) by the function.
CREATE TABLE "moderation"."user_states" (
  "platformUserId" uuid        NOT NULL,
  "state"          text        NOT NULL,
  "reason"         text,
  "decidedAt"      timestamptz NOT NULL,
  CONSTRAINT "user_states_pkey" PRIMARY KEY ("platformUserId"),
  CONSTRAINT "user_states_state_valid" CHECK ("state" IN ('active', 'suspended', 'banned', 'deleted'))
);

ALTER TABLE "moderation"."user_states" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "moderation"."user_states" FROM PUBLIC, "anon", "authenticated";
GRANT SELECT, INSERT, UPDATE ON TABLE "moderation"."user_states" TO "service_role";

COMMENT ON TABLE "moderation"."user_states" IS 'Suspended, banned and deleted platform users, keyed by the DevDogs user id.';
