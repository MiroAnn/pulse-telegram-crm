import { ensureDatabase, getEnv, json } from "../../../../lib/database";

type Campaign = {
  id: number;
  message: string;
  audience_mode: string;
  included_tag_ids: string;
  excluded_tag_ids: string;
};

function ids(value: string) {
  try {
    return (JSON.parse(value) as number[]).map(Number).filter(Boolean);
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const { DB, TELEGRAM_BOT_TOKEN, LOCAL_ADMIN_KEY } = getEnv();
  if (LOCAL_ADMIN_KEY && request.headers.get("x-admin-key") !== LOCAL_ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!TELEGRAM_BOT_TOKEN) return json({ error: "TELEGRAM_BOT_TOKEN не задан" }, 503);
  await ensureDatabase();

  const now = new Date().toISOString();
  const campaign = await DB.prepare(
    "SELECT * FROM campaigns WHERE status = 'scheduled' AND datetime(scheduled_at) <= datetime(?) ORDER BY datetime(scheduled_at) LIMIT 1",
  )
    .bind(now)
    .first<Campaign>();
  if (!campaign) return json({ ok: true, processed: 0 });

  await DB.prepare("UPDATE campaigns SET status = 'sending', updated_at = ? WHERE id = ?")
    .bind(now, campaign.id)
    .run();

  const included = ids(campaign.included_tag_ids);
  const excluded = ids(campaign.excluded_tag_ids);
  let sql = "SELECT DISTINCT c.id, c.telegram_id FROM customers c WHERE c.status = 'active' AND c.is_demo = 0";
  const bindings: number[] = [];
  if (campaign.audience_mode === "tags" && included.length) {
    sql += ` AND EXISTS (SELECT 1 FROM customer_tags ct WHERE ct.customer_id = c.id AND ct.tag_id IN (${included.map(() => "?").join(",")}))`;
    bindings.push(...included);
  }
  if (excluded.length) {
    sql += ` AND NOT EXISTS (SELECT 1 FROM customer_tags ct WHERE ct.customer_id = c.id AND ct.tag_id IN (${excluded.map(() => "?").join(",")}))`;
    bindings.push(...excluded);
  }
  const recipients = (await DB.prepare(sql).bind(...bindings).all()).results as Array<{
    id: number;
    telegram_id: string;
  }>;

  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: recipient.telegram_id, text: campaign.message, parse_mode: "HTML" }),
      });
      const result = (await response.json()) as { ok: boolean; description?: string };
      await DB.prepare(
        "INSERT OR REPLACE INTO deliveries (campaign_id, customer_id, status, error, sent_at) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(campaign.id, recipient.id, result.ok ? "sent" : "failed", result.description ?? null, now)
        .run();
      if (result.ok) sent += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      await DB.prepare(
        "INSERT OR REPLACE INTO deliveries (campaign_id, customer_id, status, error, sent_at) VALUES (?, ?, 'failed', ?, ?)",
      )
        .bind(campaign.id, recipient.id, error instanceof Error ? error.message : "Unknown error", now)
        .run();
    }
  }

  await DB.prepare(
    "UPDATE campaigns SET status = 'sent', sent_count = ?, failed_count = ?, updated_at = ? WHERE id = ?",
  )
    .bind(sent, failed, new Date().toISOString(), campaign.id)
    .run();
  return json({ ok: true, processed: 1, sent, failed });
}
