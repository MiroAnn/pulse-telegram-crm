CREATE TABLE `scenario_message_tags` (
	`message_key` text NOT NULL,
	`tag_id` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_scenario_message_tags_pair` ON `scenario_message_tags` (`message_key`,`tag_id`);--> statement-breakpoint
CREATE INDEX `idx_scenario_message_tags_tag` ON `scenario_message_tags` (`tag_id`,`message_key`);