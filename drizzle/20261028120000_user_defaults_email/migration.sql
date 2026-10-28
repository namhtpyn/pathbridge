-- Align `user` with the CLI-generated schema: email_verified defaults FALSE
-- (fail closed — an insert that omits it must not mint a verified account) and
-- role is nullable with the viewer fallback. Rebuild is required: SQLite cannot
-- ALTER a column default. PRAGMA toggles run outside the runner's transaction.
UPDATE `user` SET `email` = lower(`email`) WHERE `email` != lower(`email`);--> statement-breakpoint
PRAGMA foreign_keys = OFF;--> statement-breakpoint
CREATE TABLE `user_new` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`role` text DEFAULT 'viewer'
);--> statement-breakpoint
INSERT INTO `user_new` (`id`, `name`, `email`, `email_verified`, `image`, `created_at`, `updated_at`, `role`)
	SELECT `id`, `name`, `email`, `email_verified`, `image`, `created_at`, `updated_at`, `role` FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `user_new` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys = ON;
