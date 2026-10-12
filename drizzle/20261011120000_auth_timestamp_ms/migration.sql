-- auth tables adopted from the better-auth CLI generated schema (timestamp_ms).
-- Existing rows stored epoch SECONDS; convert to MILLISECONDS so the new column
-- mode reads them correctly. Idempotent guard: only convert values that look
-- like seconds (< 10^12; ms epochs are > 10^12 for the foreseeable future).
UPDATE "user" SET
  "created_at" = "created_at" * 1000,
  "updated_at" = "updated_at" * 1000
WHERE "created_at" IS NOT NULL AND "created_at" < 1000000000000;

UPDATE "session" SET
  "expires_at" = "expires_at" * 1000,
  "created_at" = "created_at" * 1000,
  "updated_at" = "updated_at" * 1000
WHERE "expires_at" IS NOT NULL AND "expires_at" < 1000000000000;

UPDATE "account" SET
  "created_at" = "created_at" * 1000,
  "updated_at" = "updated_at" * 1000
WHERE "created_at" IS NOT NULL AND "created_at" < 1000000000000;

UPDATE "verification" SET
  "expires_at" = "expires_at" * 1000,
  "created_at" = "created_at" * 1000,
  "updated_at" = "updated_at" * 1000
WHERE "expires_at" IS NOT NULL AND "expires_at" < 1000000000000;

UPDATE "apikey" SET
  "expires_at" = "expires_at" * 1000,
  "created_at" = "created_at" * 1000,
  "updated_at" = "updated_at" * 1000,
  "last_request" = "last_request" * 1000,
  "last_refill_at" = "last_refill_at" * 1000,
  "remaining" = NULL, "refill_interval" = NULL, "refill_amount" = NULL
WHERE "created_at" IS NOT NULL AND "created_at" < 1000000000000;

-- legacy column from the pre-plugin era: the api-key plugin's canonical owner
-- column is reference_id; user_id has been null since 20261006233354.
CREATE TABLE IF NOT EXISTS "_apikey_backup" AS SELECT * FROM "apikey";
ALTER TABLE "apikey" DROP COLUMN "user_id";
DROP TABLE "_apikey_backup";
