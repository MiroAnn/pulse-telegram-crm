import { ensureDatabase, json, parseIds } from "../../../lib/database";

type ActionBody = Record<string, unknown> & { action?: string };

async function dashboardState() {
  const DB = await ensureDatabase();
  const [customersResult, tagsResult, linksResult, campaignsResult] = await DB.batch([
    DB.prepare("SELECT * FROM customers ORDER BY is_demo ASC, datetime(created_at) DESC"),
    DB.prepare("SELECT * FROM tags ORDER BY name"),
    DB.prepare("SELECT customer_id, tag_id FROM customer_tags"),
    DB.prepare("SELECT * FROM campaigns ORDER BY datetime(created_at) DESC LIMIT 50"),
  ]);

  const tags = tagsResult.results as Array<Record<string, unknown>>;
  const links = linksResult.results as Array<{ customer_id: number; tag_id: number }>;
  const tagsById = new Map(tags.map((tag) => [Number(tag.id), tag]));
  const customerTags = new Map<number, Array<Record<string, unknown>>>();
  for (const link of links) {
    const values = customerTags.get(link.customer_id) ?? [];
    const tag = tagsById.get(link.tag_id);
    if (tag) values.push(tag);
    customerTags.set(link.customer_id, values);
  }

  const customers = (customersResult.results as Array<Record<string, unknown>>).map(
    (customer) => ({
      ...customer,
      tags: customerTags.get(Number(customer.id)) ?? [],
    }),
  );

  return {
    customers,
    tags,
    campaigns: campaignsResult.results,
    stats: {
      customers: customers.filter((item) => item.status === "active" && !item.is_demo).length,
      reachable: customers.filter((item) => item.status === "active" && !item.is_demo).length,
      campaigns: campaignsResult.results.length,
      scheduled: (campaignsResult.results as Array<Record<string, unknown>>).filter(
        (item) => item.status === "scheduled",
      ).length,
    },
  };
}

export async function GET() {
  return json(await dashboardState());
}

export async function POST(request: Request) {
  const DB = await ensureDatabase();
  const body = (await request.json()) as ActionBody;
  const now = new Date().toISOString();

  if (body.action === "seed-demo") {
    const count = await DB.prepare("SELECT COUNT(*) AS total FROM customers WHERE is_demo = 1").first<{ total: number }>();
    if (!count?.total) {
      await DB.batch([
        DB.prepare("INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)").bind("Новый клиент", "mint"),
        DB.prepare("INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)").bind("Курс осанки", "violet"),
        DB.prepare("INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)").bind("VIP", "amber"),
      ]);
      const demo = [
        ["demo-1001", "anna_fit", "Анна", "Волкова", "+7 999 123-45-67", "anna@example.com"],
        ["demo-1002", "maria_move", "Мария", "Соколова", "+7 916 555-18-20", "maria@example.com"],
        ["demo-1003", "dmitry_pro", "Дмитрий", "Орлов", null, "dmitry@example.com"],
      ];
      for (const row of demo) {
        await DB.prepare(
          "INSERT OR IGNORE INTO customers (telegram_id, username, first_name, last_name, phone, email, is_demo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
        ).bind(...row, now, now).run();
      }
      await DB.prepare(
        "INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) SELECT c.id, t.id FROM customers c, tags t WHERE c.telegram_id = 'demo-1001' AND t.name IN ('Новый клиент', 'Курс осанки')",
      ).run();
      await DB.prepare(
        "INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) SELECT c.id, t.id FROM customers c, tags t WHERE c.telegram_id = 'demo-1002' AND t.name = 'VIP'",
      ).run();
    }
  } else if (body.action === "clear-demo") {
    await DB.prepare("DELETE FROM customer_tags WHERE customer_id IN (SELECT id FROM customers WHERE is_demo = 1)").run();
    await DB.prepare("DELETE FROM customers WHERE is_demo = 1").run();
  } else if (body.action === "create-tag") {
    const name = String(body.name ?? "").trim();
    if (!name) return json({ error: "Введите название тега" }, 400);
    await DB.prepare("INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)")
      .bind(name, String(body.color ?? "violet"))
      .run();
  } else if (body.action === "set-customer-tags") {
    const customerId = Number(body.customerId);
    const tagIds = parseIds(body.tagIds);
    await DB.prepare("DELETE FROM customer_tags WHERE customer_id = ?").bind(customerId).run();
    if (tagIds.length) {
      await DB.batch(
        tagIds.map((tagId) =>
          DB.prepare("INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) VALUES (?, ?)").bind(customerId, tagId),
        ),
      );
    }
  } else if (body.action === "create-campaign") {
    const title = String(body.title ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (!title || !message) return json({ error: "Заполните название и текст" }, 400);
    const sendNow = Boolean(body.sendNow);
    const scheduledAt = sendNow ? now : String(body.scheduledAt ?? "");
    if (!sendNow && !scheduledAt) return json({ error: "Выберите время отправки" }, 400);
    await DB.prepare(
      "INSERT INTO campaigns (title, message, audience_mode, included_tag_ids, excluded_tag_ids, scheduled_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)",
    )
      .bind(
        title,
        message,
        String(body.audienceMode ?? "all"),
        JSON.stringify(parseIds(body.includedTagIds)),
        JSON.stringify(parseIds(body.excludedTagIds)),
        scheduledAt,
        now,
        now,
      )
      .run();
  } else if (body.action === "cancel-campaign") {
    await DB.prepare("UPDATE campaigns SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'scheduled'")
      .bind(now, Number(body.campaignId))
      .run();
  } else {
    return json({ error: "Неизвестное действие" }, 400);
  }

  return json(await dashboardState());
}
