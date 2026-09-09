import { getEnv } from "../../../../lib/database";

export async function GET(request: Request) {
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  const path = new URL(request.url).searchParams.get("path");
  if (!token || !path || path.includes("..")) return new Response("Not found", { status: 404 });
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
  if (!response.ok) return new Response("Not found", { status: 404 });
  return new Response(response.body, {
    headers: {
      "content-type": response.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "private, max-age=3600",
    },
  });
}
