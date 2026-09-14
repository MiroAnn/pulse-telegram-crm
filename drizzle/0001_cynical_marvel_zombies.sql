CREATE TABLE `quiz_sessions` (
	`telegram_id` text PRIMARY KEY NOT NULL,
	`answers_json` text DEFAULT '[]' NOT NULL,
	`current_step` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`result` text,
	`details` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`updated_at` text NOT NULL
);
