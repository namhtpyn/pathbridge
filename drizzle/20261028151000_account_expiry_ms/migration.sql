-- 20261011120000 converted account created_at/updated_at to milliseconds but
-- missed the token expiry columns, which schema.auth.ts declares as
-- timestamp_ms: pre-upgrade rows read as ms are 1970 dates, i.e. every OIDC
-- account seems permanently expired. Same 1e12 guard keeps it idempotent.
UPDATE `account` SET `access_token_expires_at` = `access_token_expires_at` * 1000
	WHERE `access_token_expires_at` IS NOT NULL AND `access_token_expires_at` < 1000000000000;--> statement-breakpoint
UPDATE `account` SET `refresh_token_expires_at` = `refresh_token_expires_at` * 1000
	WHERE `refresh_token_expires_at` IS NOT NULL AND `refresh_token_expires_at` < 1000000000000;
