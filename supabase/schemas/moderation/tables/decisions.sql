-- The newest decision applied to each item (`content:<type>:<ref>` or
-- `user:<platform user id>`). A message dated before it is stale: it is
-- acknowledged and ignored, so a late retry cannot undo a newer decision.
-- Keyed by text, with no member reference: account deletion leaves it alone.
CREATE TABLE "moderation"."decisions" (
  "itemKey"   text        NOT NULL,
  "type"      text        NOT NULL,
  "decidedAt" timestamptz NOT NULL,
  CONSTRAINT "decisions_pkey" PRIMARY KEY ("itemKey")
);

ALTER TABLE "moderation"."decisions" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "moderation"."decisions" FROM PUBLIC, "anon", "authenticated";
GRANT SELECT, INSERT, UPDATE ON TABLE "moderation"."decisions" TO "service_role";

COMMENT ON TABLE "moderation"."decisions" IS 'The last moderation decision applied to each item, for ordering.';
