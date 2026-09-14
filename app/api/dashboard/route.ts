import { ensureDatabase, getEnv, json, parseIds } from "../../../lib/database";

type ActionBody = Record<string, unknown> & { action?: string };

async function dashboardState() {
  const DB = await ensureDatabase();
  const [customersResult, tagsResult, linksResult, campaignsResult, quizzesResult, messagesResult] = await DB.batch([
    DB.prepare("SELECT * FROM customers ORDER BY is_demo ASC, datetime(created_at) DESC"),
    DB.prepare("SELECT * FROM tags ORDER BY name"),
    DB.prepare("SELECT customer_id, tag_id FROM customer_tags"),
    DB.prepare("SELECT * FROM campaigns ORDER BY datetime(created_at) DESC LIMIT 50"),
    DB.prepare("SELECT * FROM quiz_sessions"),
    DB.prepare("SELECT * FROM (SELECT * FROM chat_messages ORDER BY datetime(created_at) DESC, id DESC LIMIT 1000) ORDER BY datetime(created_at) ASC, id ASC"),
  ]);

  const tags = tagsResult.results as Array<Record<string, unknown>>;
  const links = linksResult.results as Array<{ customer_id: number; tag_id: number }>;
  const tagsById = new Map(tags.map((tag) => [Number(tag.id), tag]));
  const customerTags = new Map<number, Array<Record<string, unknown>>>();
  const quizzes = new Map(
    (quizzesResult.results as Array<Record<string, unknown>>).map((quiz) => [String(quiz.telegram_id), quiz]),
  );
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
      quiz: quizzes.get(String(customer.telegram_id)) ?? null,
    }),
  );

  return {
    customers,
    tags,
    campaigns: campaignsResult.results,
    messages: messagesResult.results,
    stats: {
      customers: customers.filter((item) => item.status === "active" && !item.is_demo).length,
      reachable: customers.filter((item) => item.status === "active" && !item.is_demo).length,
      campaigns: campaignsResult.results.length,
      scheduled: (campaignsResult.results as Array<Record<string, unknown>>).filter(
        (item) => item.status === "scheduled",
      ).length,
      unread: (messagesResult.results as Array<Record<string, unknown>>).filter(
        (item) => item.direction === "inbound" && Boolean(item.is_unread),
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
  } else if (body.action === "update-campaign") {
    const campaignId = Number(body.campaignId);
    const campaign = await DB.prepare("SELECT status FROM campaigns WHERE id = ?")
      .bind(campaignId)
      .first<{ status: string }>();
    if (!campaign) return json({ error: "Рассылка не найдена" }, 404);
    if (campaign.status !== "scheduled") return json({ error: "Можно редактировать только запланированную рассылку" }, 409);
    const title = String(body.title ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (!title || !message) return json({ error: "Заполните название и текст" }, 400);
    const sendNow = Boolean(body.sendNow);
    const scheduledAt = sendNow ? now : String(body.scheduledAt ?? "");
    if (!sendNow && !scheduledAt) return json({ error: "Выберите время отправки" }, 400);
    await DB.prepare(
      "UPDATE campaigns SET title = ?, message = ?, audience_mode = ?, included_tag_ids = ?, excluded_tag_ids = ?, scheduled_at = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'",
    )
      .bind(
        title,
        message,
        String(body.audienceMode ?? "all"),
        JSON.stringify(parseIds(body.includedTagIds)),
        JSON.stringify(parseIds(body.excludedTagIds)),
        scheduledAt,
        now,
        campaignId,
      )
      .run();
  } else if (body.action === "cancel-campaign") {
    await DB.prepare("UPDATE campaigns SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'scheduled'")
      .bind(now, Number(body.campaignId))
      .run();
  } else if (body.action === "mark-chat-read") {
    const telegramId = String(body.telegramId ?? "");
    await DB.prepare(
      "UPDATE chat_messages SET is_unread = 0 WHERE telegram_id = ? AND direction = 'inbound'",
    ).bind(telegramId).run();
  } else if (body.action === "send-chat-message") {
    const telegramId = String(body.telegramId ?? "");
    const message = String(body.message ?? "").trim();
    if (!telegramId || !message) return json({ error: "Введите сообщение" }, 400);
    const customer = await DB.prepare(
      "SELECT id FROM customers WHERE telegram_id = ? AND is_demo = 0",
    ).bind(telegramId).first<{ id: number }>();
    if (!customer) return json({ error: "Клиент не найден" }, 404);
    const token = getEnv().TELEGRAM_BOT_TOKEN;
    if (!token) return json({ error: "Бот ещё не подключён" }, 503);
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text: message }),
    });
    const result = await response.json() as {
      ok: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!result.ok) return json({ error: result.description ?? "Telegram не отправил сообщение" }, 502);
    await DB.prepare(
      `INSERT INTO chat_messages
       (telegram_id, telegram_message_id, direction, kind, text, scenario, is_unread, created_at)
       VALUES (?, ?, 'outbound', 'text', ?, 'admin_reply', 0, ?)`,
    ).bind(telegramId, result.result?.message_id ?? null, message, now).run();
    await DB.prepare(
      "UPDATE chat_messages SET is_unread = 0 WHERE telegram_id = ? AND direction = 'inbound'",
    ).bind(telegramId).run();
  } else {
    return json({ error: "Неизвестное действие" }, 400);
  }

  return json(await dashboardState());
}
