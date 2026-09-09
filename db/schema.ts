import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
