-- own-scope log reads (live tail fires per request), retention purge and
-- record guards filtered these columns with full table scans
CREATE INDEX IF NOT EXISTS `access_log_route_id_idx` ON `access_log` (`route_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `access_log_ts_idx` ON `access_log` (`ts`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `routes_user_id_idx` ON `routes` (`user_id`);
