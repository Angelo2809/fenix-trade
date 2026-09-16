"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  TrendingUp,
  ChartNoAxesCombined,
  LoaderCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Brand } from "@/components/brand";
import { Scene } from "@/components/scene";
import { ErrorNotice, Modal } from "@/components/ui";
import { post } from "@/lib/api";
import type { User } from "@/lib/types";
const schema = z.object({
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe sua senha."),
  remember: z.boolean(),
});
export default function LoginPage() {
  const [show, setShow] = useState(false),
    [help, setHelp] = useState(false),
    [error, setError] = useState<unknown>(null),
    [success, setSuccess] = useState(false);
  const router = useRouter(),
    client = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { remember: false },
  });
  async function submit(values: z.infer<typeof schema>) {
    setError(null);
    try {
      const result = await post<{ user: User; state: string }>(
        "/auth/login",
        values,
      );
      client.clear();
      client.setQueryData(["me"], result.user);
      setSuccess(true);
      router.prefetch(result.user.must_change_password ? "/change-password" : "/dashboard");
      // Navigation never waits on animation events or asset loading.
      setTimeout(
        () =>
          router.replace(
            result.user.must_change_password
              ? "/change-password"
              : "/dashboard",
          ),
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1100,
      );
    } catch (e) {
      setError(e);
    }
  }
  return (
    <main className={`login-page ${success ? "login-success" : isSubmitting ? "login-pending" : ""}`}>
      <Scene />
      <div className="cinema-intro" aria-hidden="true">
        <div className="cinema-aura" />
        <div className="cinema-bird">
          <img className="cinema-wing cinema-wing-right" src="/assets/fenix/wing-right.png" alt="" />
          <img className="cinema-wing cinema-wing-left" src="/assets/fenix/wing-left.png" alt="" />
          <img className="cinema-body" src="/assets/fenix/body.png" alt="" />
        </div>
        <div className="cinema-flare" />
        <div className="cinema-title">FENIX<span>CAPITAL EM EVOLUÇÃO</span></div>
      </div>
      {success && (
        <div className="login-arrival" role="status" aria-live="polite">
          <div className="arrival-halo" aria-hidden="true" />
          <ShieldCheck size={28} />
          <span>Acesso confirmado</span>
          <small>Bem-vindo à Fenix</small>
        </div>
      )}
      <div className="login-motto">
        DISCIPLINA
        <br />
        DADOS
        <br />
        RESULTADOS
        <br />
        LIBERDADE
      </div>
      <div className="corner-copy">
        INVESTIR
        <br />É CONSTRUIR
        <br />
        TEMPO <span />
      </div>
      <section className="login-story">
        <span className="eyebrow">CAPITAL EM EVOLUÇÃO</span>
        <h1>Fenix</h1>
        <div className="gold-rule" />
        <p>
          Estratégia hoje.
          <br />
          Mais liberdade amanhã.
        </p>
        <div className="story-features">
          <span>
            <ChartNoAxesCombined />
            Robôs
            <br />
            de trading
          </span>
          <span>
            <ShieldCheck />
            Controle
            <br />
            de capital
          </span>
          <span>
            <TrendingUp />
            Visão
            <br />
            de longo prazo
          </span>
        </div>
        <small>MESMOS VALORES. MAIS POSSIBILIDADES.</small>
      </section>
      <section className="login-card">
        <Brand />
        <div className="ornament" />
        <div className="login-heading">
          <h2>Acesso privado aos sócios</h2>
          <p>Dados, estratégia e resultados em um só lugar.</p>
        </div>
        <form onSubmit={handleSubmit(submit)} noValidate>
          <label className="input-label" htmlFor="email">
            E-mail
          </label>
          <div className="input-icon">
            <Mail size={19} />
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="Seu e-mail"
              {...register("email")}
              aria-invalid={!!errors.email}
            />
          </div>
          {errors.email && (
            <p className="field-error">{errors.email.message}</p>
          )}
          <label className="input-label" htmlFor="password">
            Senha
          </label>
          <div className="input-icon">
            <LockKeyhole size={19} />
            <input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Sua senha"
              {...register("password")}
              aria-invalid={!!errors.password}
            />
            <button
              className="icon-button"
              type="button"
              onClick={() => setShow(!show)}
              aria-label={show ? "Ocultar senha" : "Mostrar senha"}
            >
              {show ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
          {errors.password && (
            <p className="field-error">{errors.password.message}</p>
          )}
          <div className="login-options">
            <label>
              <input type="checkbox" {...register("remember")} /> Lembrar-me
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() => setHelp(true)}
            >
              Esqueci minha senha
            </button>
          </div>
          <ErrorNotice error={error} />
          <button
            className="button gold login-submit"
            disabled={isSubmitting || success}
          >
            {isSubmitting ? (
              <>
                <LoaderCircle size={18} className="spin" />
                Autenticando…
              </>
            ) : success ? (
              <>
                <ShieldCheck size={18} />
                Acesso confirmado
              </>
            ) : (
              <>
                Entrar <ArrowRight size={19} />
              </>
            )}
          </button>
        </form>
        <p className="secure-copy">
          <LockKeyhole size={13} /> Sessão protegida e acesso restrito
          <br />
          <span>Uso exclusivo dos sócios Fenix.</span>
        </p>
        <div className="ornament" />
        <div className="login-signature">
          FENIX <span>PRIVATE WEALTH TECHNOLOGY</span>
        </div>
      </section>
      <div className="login-footnote">
        PRIVATE
        <br />
        WEALTH
        <br />
        TECHNOLOGY <span />
      </div>
      {help && (
        <Modal
          title="Recuperar acesso"
          description="Seu acesso é gerenciado pelo administrador da Fenix."
          onClose={() => setHelp(false)}
        >
          <p>
            Solicite ao administrador uma nova senha temporária. Ela substitui a
            senha anterior, expira em 24 horas por padrão e exige a criação de
            uma nova senha no primeiro acesso.
          </p>
          <button className="button gold" onClick={() => setHelp(false)}>
            Entendi
          </button>
        </Modal>
      )}
    </main>
  );
}
