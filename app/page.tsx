import type { Metadata } from "next";
import { AdminDashboard } from "./AdminDashboard";

export const metadata: Metadata = {
  title: "Pulse — Telegram CRM",
  description: "Клиенты, сегменты и рассылки Telegram в одном месте.",
};

export default function Home() {
  return <AdminDashboard />;
}
