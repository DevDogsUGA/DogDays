-- The moderation receiver's state: which platform messages were applied, the
-- last decision per item, and which platform users are suspended, banned or
-- deleted. Not exposed over the API (config.toml serves only `dogdays`): only
-- `dogdays.apply_moderation_event` writes it, and only the receiver route
-- (src/app/(api)/platform-moderation) calls that, with the service role.
CREATE SCHEMA IF NOT EXISTS "moderation";

GRANT USAGE ON SCHEMA "moderation" TO "service_role";
