CREATE TABLE `scenario_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_key` text NOT NULL,
	`scenario_key` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`tag_name` text,
	`tag_color` text DEFAULT 'violet' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_scenario_messages_key` ON `scenario_messages` (`message_key`);--> statement-breakpoint
CREATE INDEX `idx_scenario_messages_scenario_order` ON `scenario_messages` (`scenario_key`,`sort_order`);