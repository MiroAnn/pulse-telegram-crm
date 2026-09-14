import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const customers = sqliteTable(
  "customers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    telegramId: text("telegram_id").notNull(),
    username: text("username"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    phone: text("phone"),
    email: text("email"),
    avatarUrl: text("avatar_url"),
    status: text("status").notNull().default("active"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("idx_customers_telegram_id").on(table.telegramId)],
);

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    color: text("color").notNull().default("violet"),
  },
  (table) => [uniqueIndex("idx_tags_name").on(table.name)],
);

export const customerTags = sqliteTable(
  "customer_tags",
  {
    customerId: integer("customer_id").notNull(),
    tagId: integer("tag_id").notNull(),
  },
  (table) => [
    uniqueIndex("idx_customer_tags_pair").on(table.customerId, table.tagId),
  ],
);

export const campaigns = sqliteTable("campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  audienceMode: text("audience_mode").notNull().default("all"),
  excludedTagIds: text("excluded_tag_ids").notNull().default("[]"),
  includedTagIds: text("included_tag_ids").notNull().default("[]"),
  scheduledAt: text("scheduled_at"),
  status: text("status").notNull().default("draft"),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const deliveries = sqliteTable(
  "deliveries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campaignId: integer("campaign_id").notNull(),
    customerId: integer("customer_id").notNull(),
    status: text("status").notNull().default("pending"),
    error: text("error"),
    sentAt: text("sent_at"),
  },
  (table) => [
    uniqueIndex("idx_deliveries_campaign_customer").on(
      table.campaignId,
      table.customerId,
    ),
  ],
);

export const quizSessions = sqliteTable(
  "quiz_sessions",
  {
    telegramId: text("telegram_id").primaryKey(),
    answersJson: text("answers_json").notNull().default("[]"),
    currentStep: integer("current_step").notNull().default(1),
    status: text("status").notNull().default("active"),
    result: text("result"),
    details: text("details"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_quiz_sessions_status").on(table.status, table.updatedAt)],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    telegramId: text("telegram_id").notNull(),
    telegramMessageId: integer("telegram_message_id"),
    direction: text("direction").notNull(),
    kind: text("kind").notNull().default("text"),
    text: text("text").notNull(),
    scenario: text("scenario").notNull().default("freeform"),
    isUnread: integer("is_unread", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_chat_messages_telegram_message").on(
      table.telegramId,
      table.telegramMessageId,
      table.direction,
    ),
    index("idx_chat_messages_chat_created").on(table.telegramId, table.createdAt),
    index("idx_chat_messages_unread").on(table.isUnread, table.createdAt),
  ],
);

export const scenarioMessages = sqliteTable(
  "scenario_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    messageKey: text("message_key").notNull(),
    scenarioKey: text("scenario_key").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    tagName: text("tag_name"),
    tagColor: text("tag_color").notNull().default("violet"),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_scenario_messages_key").on(table.messageKey),
    index("idx_scenario_messages_scenario_order").on(table.scenarioKey, table.sortOrder),
  ],
);
