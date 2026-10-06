CREATE TABLE `access_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`ts` text NOT NULL,
	`pair_id` integer,
	`pair_path` text,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status` integer NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`client_ip` text,
	`user_agent` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
