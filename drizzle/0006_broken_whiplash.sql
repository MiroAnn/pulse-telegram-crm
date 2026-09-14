CREATE TABLE `scenario_settings` (
	`scenario_key` text PRIMARY KEY NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
