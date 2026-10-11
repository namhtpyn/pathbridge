-- auth-table hardening from the better-auth CLI reference schema
-- (scripts/generated/auth-schema.gen.ts): FK delete cascades + lookup indexes.
-- Storage-compatible: no column changes, timestamp (seconds) mode untouched.
CREATE INDEX IF NOT EXISTS `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `apikey_configId_idx` ON `apikey` (`config_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `apikey_referenceId_idx` ON `apikey` (`reference_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `apikey_key_idx` ON `apikey` (`key`);--> statement-breakpoint
-- FK cascades (delete user -> sessions/accounts die with them): sqlite can't
-- ALTER a FK; recreate-and-copy only matters for existing rows, and user
-- deletion already cascades manually in users.remove. Declared in the drizzle
-- schema for FUTURE databases; no data migration needed now.
