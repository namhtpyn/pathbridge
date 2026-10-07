-- rename: pairs -> routes (terminology change; data preserved)
ALTER TABLE `pairs` RENAME TO `routes`;--> statement-breakpoint
ALTER TABLE `access_log` RENAME COLUMN `pair_id` TO `route_id`;--> statement-breakpoint
ALTER TABLE `access_log` RENAME COLUMN `pair_path` TO `route_path`;--> statement-breakpoint
UPDATE `roles` SET `statements` = REPLACE(`statements`, '"pairs"', '"routes"');--> statement-breakpoint
UPDATE `apikey` SET `permissions` = REPLACE(`permissions`, '"pairs"', '"routes"');--> statement-breakpoint
UPDATE `apikey` SET `permissions` = REPLACE(`permissions`, '\"pairs\"', '\"routes\"');--> statement-breakpoint
UPDATE `apikey` SET `metadata` = REPLACE(`metadata`, '"pairs"', '"routes"');
