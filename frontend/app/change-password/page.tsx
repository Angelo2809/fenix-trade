"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Brand } from "@/components/brand";
import { ErrorNotice } from "@/components/ui";
import { post } from "@/lib/api";
import { LockKeyhole, ArrowRight } from "lucide-react";
export default function ChangePassword() {
  const [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const router = useRouter(),
    query = useQueryClient();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    if (data.get("new_password") !== data.get("confirm")) {
      setError("As novas senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      await post("/auth/change-password", {
        current_password: data.get("current_password"),
        new_password: data.get("new_password"),
      });
      query.clear();
      router.replace("/dashboard");
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }
  return (
    <main className="password-page">
      <section className="panel password-card">
        <Brand />
        <div className="ornament" />
        <span className="section-icon">
          <LockKeyhole />
        </span>
        <h1>Proteja seu acesso</h1>
        <p>
          No primeiro acesso, substitua a senha temporária para entrar na
          plataforma.
        </p>
        <form onSubmit={submit} className="form-stack">
          <label>
            Senha atual ou temporária
            <input
              name="current_password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
            />
          </label>
          <label>
            Nova senha
            <input
              name="new_password"
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              required
            />
            <small>Use pelo menos 8 caracteres.</small>
          </label>
          <label>
            Confirme a nova senha
            <input
              name="confirm"
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </label>
          <ErrorNotice error={error} />
          <button className="button gold" disabled={busy}>
            {busy ? "Salvando…" : "Salvar e continuar"}
            <ArrowRight size={18} />
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => router.replace("/login")}
          >
            Voltar ao login
          </button>
        </form>
      </section>
    </main>
  );
}
