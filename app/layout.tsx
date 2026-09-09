import type { Metadata } from "next";
import { headers } from "next/headers";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["cyrillic", "latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3001";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  return {
    title: "Pulse — Telegram CRM",
    description: "Управление клиентами, сегментами и рассылками Telegram.",
    openGraph: {
      title: "Pulse — Telegram CRM",
      description: "Клиенты, сегменты и рассылки в одном месте.",
      images: [{ url: imageUrl, width: 1735, height: 907, alt: "Pulse — Telegram CRM" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Pulse — Telegram CRM",
      description: "Клиенты, сегменты и рассылки в одном месте.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body className={manrope.variable}>{children}</body></html>;
}
