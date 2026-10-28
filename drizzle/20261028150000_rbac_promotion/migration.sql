-- Upgrade path promised by SPEC: a database that predates RBAC (user rows but
-- nobody holds the admin role) must come out with an administrator and owned
-- routes, or the instance is administratively bricked (sign-up is closed and
-- seed-admin only runs on an empty user table). Idempotent: both statements are
-- no-ops on a database that already has an admin.
UPDATE `user` SET `role` = 'admin'
	WHERE `id` = (SELECT `id` FROM `user` ORDER BY `created_at`, `id` LIMIT 1)
	AND NOT EXISTS (SELECT 1 FROM `user` WHERE `role` LIKE '%admin%');--> statement-breakpoint
UPDATE `routes` SET `user_id` = (SELECT `id` FROM `user` WHERE `role` LIKE '%admin%' ORDER BY `created_at`, `id` LIMIT 1)
	WHERE `user_id` IS NULL;
