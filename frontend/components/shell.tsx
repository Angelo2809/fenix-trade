"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  UsersRound,
  CalendarCheck2,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  KeyRound,
  ChevronDown,
  ArrowUpRight,
} from "lucide-react";
import { Brand } from "./brand";
import { RevealContent } from "./reveal-content";
import { Loading, ErrorNotice, Modal } from "./ui";
import { api, ApiError, post } from "@/lib/api";
import type { User } from "@/lib/types";
export function Shell({
  children,
  adminOnly = false,
}: {
  children: (user: User) => React.ReactNode;
  adminOnly?: boolean;
}) {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
  });
  const [mobile, setMobile] = useState(false),
    [profile, setProfile] = useState(false),
    [error, setError] = useState<unknown>(null);
  const router = useRouter(),
    pathname = usePathname(),
    client = useQueryClient();
  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401)
      router.replace("/login");
    if (me.data?.must_change_password) router.replace("/change-password");
    if (adminOnly && me.data?.role === "PARTNER") router.replace("/dashboard");
  }, [me.error, me.data, router, adminOnly]);
  async function logout(all = false) {
    try {
      await post(all ? "/auth/logout-all" : "/auth/logout");
      client.clear();
      router.replace("/login");
    } catch (e) {
      setError(e);
    }
  }
  if (
    !me.data ||
    me.data.must_change_password ||
    (adminOnly && me.data.role !== "ADMIN")
  )
    return (
      <main className="auth-loading">
        <Brand />
        <Loading text="Verificando seu acesso…" />
        <ErrorNotice
          error={
            me.error instanceof ApiError && me.error.status === 401
              ? null
              : me.error
          }
        />
      </main>
    );
  const user = me.data,
    initials = user.name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("");
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <Link href="/dashboard" aria-label="Fenix, visão geral">
          <Brand />
        </Link>
        <button
          className="icon-button mobile-close"
          onClick={() => setMobile(false)}
          aria-label="Fechar menu"
        >
          <X />
        </button>
        <div className="ornament" />
        <span className="nav-caption">PLATAFORMA</span>
        <nav>
          <Link
            className={pathname === "/dashboard" ? "active" : ""}
            href="/dashboard"
            onClick={() => setMobile(false)}
          >
            <LayoutDashboard size={20} />
            Visão geral
          </Link>
          <Link
            className={pathname === "/closings" ? "active" : ""}
            href="/closings"
            onClick={() => setMobile(false)}
          >
            <CalendarCheck2 size={20} />
            Fechamentos
          </Link>
          {user.role === "ADMIN" && (
            <Link
              className={pathname === "/admin" ? "active" : ""}
              href="/admin"
              onClick={() => setMobile(false)}
            >
              <UsersRound size={20} />
              Administração
            </Link>
          )}
        </nav>
        <div className="sidebar-scene" />
        <div className="sidebar-quote">
          <div className="gold-rule" />
          <p>
            Estratégia hoje.
            <br />
            Mais liberdade
            <br />
            amanhã.
          </p>
          <small>
            MESMOS VALORES.
            <br />
            MAIS POSSIBILIDADES.
          </small>
        </div>
        <div className="sidebar-bottom">
          <ShieldCheck size={17} />
          <span>
            AMBIENTE PRIVADO
            <br />
            <b>FENIX CAPITAL</b>
          </span>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobile(true)}
            aria-label="Abrir menu"
          >
            <Menu />
          </button>
          <div className="welcome">
            Bem-vindo à Fenix, {user.name.split(" ")[0]}.
            <small>Disciplina hoje. Mais liberdade amanhã.</small>
          </div>
          <div className="private-label">
            <ShieldCheck size={16} /> Acesso privado
          </div>
          <button className="profile-button" onClick={() => setProfile(true)}>
            <span className="avatar">{initials}</span>
            <span>
              {user.name}
              <small>{user.role === "ADMIN" ? "Administrador" : "Sócio"}</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </header>
        <RevealContent key={pathname}>
          {children(user)}
        </RevealContent>
        <footer className="app-footer">
          <span>INVESTIR É CONSTRUIR TEMPO</span>
          <span>
            FENIX <ArrowUpRight size={12} /> CAPITAL EM EVOLUÇÃO
          </span>
        </footer>
      </div>
      {profile && (
        <Modal
          title="Seu acesso"
          description={user.email}
          onClose={() => setProfile(false)}
        >
          <div className="profile-actions">
            <Link className="button" href="/change-password">
              <KeyRound size={18} />
              Alterar senha
            </Link>
            <button className="button" onClick={() => logout()}>
              <LogOut size={18} />
              Sair desta sessão
            </button>
            <button className="button danger" onClick={() => logout(true)}>
              <LogOut size={18} />
              Sair de todos os dispositivos
            </button>
          </div>
          <ErrorNotice error={error} />
        </Modal>
      )}
    </div>
  );
}
