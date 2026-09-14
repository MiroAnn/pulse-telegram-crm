CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`telegram_id` text NOT NULL,
	`telegram_message_id` integer,
	`direction` text NOT NULL,
	`kind` text DEFAULT 'text' NOT NULL,
	`text` text NOT NULL,
	`scenario` text DEFAULT 'freeform' NOT NULL,
	`is_unread` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_messages_telegram_message` ON `chat_messages` (`telegram_id`,`telegram_message_id`,`direction`);--> statement-breakpoint
CREATE INDEX `idx_chat_messages_chat_created` ON `chat_messages` (`telegram_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_messages_unread` ON `chat_messages` (`is_unread`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
