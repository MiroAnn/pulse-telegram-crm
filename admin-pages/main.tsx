import { FormEvent, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { AdminDashboard } from "../app/AdminDashboard";
import "../app/globals.css";

declare global { interface Window { PULSE_API_URL?: string } }

function PagesApp() {
  const [password, setPassword] = useState(() => sessionStorage.getItem("pulse-admin-password") || "");
  const [draft, setDraft] = useState("");
  const clearPassword = useCallback(() => { sessionStorage.removeItem("pulse-admin-password"); setPassword(""); }, []);
  if (password) return <AdminDashboard apiBase={window.PULSE_API_URL || ""} authPassword={password} onUnauthorized={clearPassword} />;
  function submit(event: FormEvent) { event.preventDefault(); const value = draft.trim(); if (!value) return; sessionStorage.setItem("pulse-admin-password", value); setPassword(value); }
  return <main className="login-shell"><form className="login-card" onSubmit={submit}><span className="brand-mark">P</span><h1>Вход в Pulse</h1><p>Админка содержит персональные данные клиентов. Введите пароль, выданный при развёртывании.</p><label><span>Пароль администратора</span><input type="password" autoComplete="current-password" required value={draft} onChange={(event) => setDraft(event.target.value)} /></label><button className="primary-button">Войти</button></form></main>;
}

createRoot(document.getElementById("root")!).render(<PagesApp />);
