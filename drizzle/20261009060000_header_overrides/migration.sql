-- header overrides: upstream_host (single Host string) generalizes into
-- request_headers + response_headers JSON lists of {name, op: set|remove, value?}.
-- Migration rewrites every stored upstreamHost into requestHeaders as a
-- host:set entry; empty lists become NULL (= no overrides).
ALTER TABLE `routes` ADD COLUMN `request_headers` text;--> statement-breakpoint
ALTER TABLE `routes` ADD COLUMN `response_headers` text;--> statement-breakpoint
UPDATE `routes` SET `request_headers` = CASE
  WHEN `upstream_host` IS NULL OR `upstream_host` = '' THEN NULL
  ELSE json_array(json_object('name', 'host', 'op', 'set', 'value', `upstream_host`))
END;--> statement-breakpoint
ALTER TABLE `routes` DROP COLUMN `upstream_host`;
