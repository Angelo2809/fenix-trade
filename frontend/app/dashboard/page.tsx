"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  ChartNoAxesCombined,
  Coins,
  Layers,
  TrendingUp,
  ShieldCheck,
  CalendarCheck2,
  UploadCloud,
  ArrowRight,
  CircleCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { Loading, ErrorNotice, Empty } from "@/components/ui";
import { AccountForm } from "@/components/account-form";
import {
  AllocationChart,
  EvolutionChart,
  MonthlyChart,
} from "@/components/charts";
import { api, money, percent, dateLabel } from "@/lib/api";
import { Account, Dashboard, Batch, User, accountName } from "@/lib/types";
const statuses = {
  UNCONFIGURED: "Configuração pendente",
  LOST: "Limite atingido",
  ACTIVE: "Em operação",
  INACTIVE: "Inativa",
};
export default function DashboardPage() {
  return <Shell>{(user) => <Content user={user} />}</Shell>;
}
function Content({ user }: { user: User }) {
  const [accountId, setAccountId] = useState(""),
    [period, setPeriod] = useState("ALL"),
    [year, setYear] = useState(""),
    [editing, setEditing] = useState<Account | null>(null);
  const all = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<Account[]>("/accounts"),
  });
  const query = useQuery({
    queryKey: ["dashboard", accountId, period],
    queryFn: () =>
      api<Dashboard>(
        `/dashboard?period=${period}${accountId ? `&account_id=${accountId}` : ""}`,
      ),
  });
  const last = useQuery({
    queryKey: ["latest-import"],
    queryFn: () => api<Batch | null>("/imports/latest"),
  });
  const data = query.data,
    summary = data?.summary;
  const years = [
    ...new Set(data?.monthly.map((m) => m.month.slice(0, 4)) || []),
  ]
    .sort()
    .reverse();
  const selectedYear = year && years.includes(year) ? year : years[0] || "";
  const unconfigured = (all.data || []).filter(
    (a) => a.status === "UNCONFIGURED",
  );
  const pending = (all.data || []).filter((a) => a.pending_months.length);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">SEU CAPITAL, EM PERSPECTIVA</span>
          <h1>Visão geral</h1>
          <p>Acompanhe cada operação. Construa o próximo passo.</p>
        </div>
        <div className="account-select">
          <label htmlFor="account-filter">CONTA DE INVESTIMENTO</label>
          <select
            id="account-filter"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Todas as contas</option>
            {all.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {accountName(a)}
                {a.nickname ? ` · ${a.account_number}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      {accountId && (
        <button
          className="text-button back-link"
          onClick={() => setAccountId("")}
        >
          <ArrowLeft size={15} />
          Voltar para todas as contas
        </button>
      )}
      {unconfigured.length > 0 && (
        <div className="action-notice">
          <span>
            <SlidersHorizontal size={19} />
            <strong>
              {unconfigured.length === 1
                ? "Nova conta detectada"
                : `${unconfigured.length} contas para configurar`}
            </strong>{" "}
            Defina o limite de perda e a data de início.
          </span>
          {user.role === "ADMIN" ? (
            <button
              className="button small"
              onClick={() => setEditing(unconfigured[0])}
            >
              Configurar conta
              <ArrowRight size={15} />
            </button>
          ) : (
            <span>O administrador concluirá a configuração.</span>
          )}
        </div>
      )}
      {pending.length > 0 && (
        <div className="action-notice">
          <span>
            <CalendarCheck2 size={19} />
            <strong>Há meses prontos para fechar.</strong> Confira os resultados
            e registre os repasses.
          </span>
          <Link className="text-button" href="/closings">
            Ver fechamentos
            <ArrowRight size={15} />
          </Link>
        </div>
      )}
      <ErrorNotice error={query.error || all.error} />
      {query.isLoading && <Loading />}
      {summary && (
        <>
          <div className="data-context">
            <span>
              <span className="live-dot" />
              {summary.account_count}{" "}
              {summary.account_count === 1
                ? "conta acompanhada"
                : "contas acompanhadas"}
            </span>
            <span>
              Última importação: {dateLabel(summary.last_update, true)}
            </span>
          </div>
          <div className="kpi-grid">
            {[
              {
                label: "RESULTADO ACUMULADO",
                value: money(summary.result),
                foot: "Operações + ajustes confirmados",
                Icon: Coins,
                accent: true,
              },
              {
                label: "LIMITES CONTRATADOS",
                value: money(summary.capital),
                foot: "Capacidade de perda das mesas",
                Icon: Layers,
              },
              {
                label: "REPASSES REGISTRADOS",
                value: money(summary.paid),
                foot: "90% do lucro disponível fechado",
                Icon: ChartNoAxesCombined,
              },
              {
                label: "RESULTADO / LIMITE",
                value: percent(summary.return_pct),
                foot: "Sobre as mesas configuradas",
                Icon: TrendingUp,
              },
              {
                label: "DRAWDOWN MÁXIMO",
                value: percent(summary.drawdown_pct),
                foot: money(summary.drawdown) + " de recuo do resultado",
                Icon: ShieldCheck,
              },
            ].map((k) => (
              <section
                className={`kpi ${k.accent ? "featured" : ""}`}
                key={k.label}
              >
                <k.Icon className="kpi-icon" size={26} />
                <div>
                  <span>{k.label}</span>
                  <strong>{k.value}</strong>
                  <small>{k.foot}</small>
                </div>
              </section>
            ))}
          </div>
          {summary.unconfigured_count > 0 && (
            <p className="hint">
              Os limites, saldos e percentuais excluem contas ainda não
              configuradas. Os resultados importados continuam visíveis.
            </p>
          )}
          {!data!.accounts.length ? (
            <section className="panel">
              <Empty title="Sua próxima etapa começa aqui">
                <p>
                  Importe o relatório CSV para identificar as contas e
                  acompanhar os resultados.
                </p>
                {user.role === "ADMIN" && (
                  <Link href="/admin?tab=imports" className="button gold">
                    <UploadCloud size={18} />
                    Importar primeiro relatório
                  </Link>
                )}
              </Empty>
            </section>
          ) : (
            <>
              <div className="dashboard-grid">
                <div className="charts-column">
                  <section className="panel">
                    <div className="panel-heading">
                      <div className="panel-title">
                        <TrendingUp />
                        <div>
                          <h2>Evolução dos resultados</h2>
                          <p>Resultado acumulado e repasses recebidos</p>
                        </div>
                      </div>
                      <div className="periods" aria-label="Período do gráfico">
                        {["1M", "3M", "6M", "1A", "2A", "ALL"].map((p) => (
                          <button
                            key={p}
                            className={period === p ? "selected" : ""}
                            aria-pressed={period === p}
                            onClick={() => setPeriod(p)}
                          >
                            {p === "ALL" ? "Todos" : p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="chart-legend">
                      <span>
                        <i />
                        Resultado acumulado
                      </span>
                      <span>
                        <i />
                        Repasses recebidos
                      </span>
                    </div>
                    {data!.evolution.length ? (
                      <EvolutionChart data={data!.evolution} />
                    ) : (
                      <Empty title="Sem operações neste período" />
                    )}
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <div className="panel-title">
                        <ChartNoAxesCombined />
                        <div>
                          <h2>Resultados mensais</h2>
                          <p>Lucro / prejuízo em reais</p>
                        </div>
                      </div>
                      <select
                        aria-label="Ano dos resultados"
                        value={selectedYear}
                        onChange={(e) => setYear(e.target.value)}
                      >
                        {years.length ? (
                          years.map((y) => <option key={y}>{y}</option>)
                        ) : (
                          <option value="">Sem dados</option>
                        )}
                      </select>
                    </div>
                    {data!.monthly.length ? (
                      <MonthlyChart
                        data={data!.monthly.filter((m) =>
                          m.month.startsWith(selectedYear),
                        )}
                      />
                    ) : (
                      <Empty title="Nenhum resultado mensal" />
                    )}
                    <details className="chart-details">
                      <summary>Ver valores dos gráficos</summary>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Mês</th>
                              <th>CSV</th>
                              <th>Confirmado</th>
                              <th>Repasse</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data!.monthly.map((m) => (
                              <tr key={m.month}>
                                <td>{m.month}</td>
                                <td>{money(m.calculated)}</td>
                                <td>{money(m.confirmed)}</td>
                                <td>{money(m.paid)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </section>
                </div>
                <div className="details-column">
                  <section className="panel">
                    <div className="panel-heading">
                      <div className="panel-title">
                        <ShieldCheck />
                        <div>
                          <h2>Status das mesas</h2>
                          <p>Limite de perda por conta</p>
                        </div>
                      </div>
                    </div>
                    <div className="desk-list">
                      {data!.accounts.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => setAccountId(a.id)}
                          className="desk-row"
                        >
                          <span
                            className={`status-dot ${a.status.toLowerCase()}`}
                          />
                          <span className="desk-name">
                            <b>{accountName(a)}</b>
                            <small>{statuses[a.status]}</small>
                          </span>
                          <span className="desk-result">
                            <b
                              className={
                                Number(a.result) < 0 ? "negative" : "positive"
                              }
                            >
                              {money(a.result)}
                            </b>
                            <small>resultado total</small>
                          </span>
                          <ArrowUpRight size={16} />
                        </button>
                      ))}
                    </div>
                    <p className="panel-note">
                      A perda da mesa ocorre ao atingir o limite contratado. O
                      histórico permanece disponível.
                    </p>
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <div className="panel-title">
                        <Layers />
                        <h2>Limites por conta</h2>
                      </div>
                    </div>
                    {data!.accounts.some((a) => a.initial_capital) ? (
                      <AllocationChart accounts={data!.accounts} />
                    ) : (
                      <Empty title="Configure o limite das mesas" />
                    )}
                  </section>
                  <section className="panel upload-summary">
                    <div className="panel-heading">
                      <div className="panel-title">
                        <UploadCloud />
                        <h2>Última importação</h2>
                      </div>
                      {user.role === "ADMIN" && (
                        <Link className="text-button" href="/admin?tab=imports">
                          Ver histórico
                          <ArrowRight size={15} />
                        </Link>
                      )}
                    </div>
                    {last.data ? (
                      <>
                        <div className="file-summary">
                          <CircleCheck size={25} />
                          <div>
                            <b>{last.data.filename}</b>
                            <small>
                              {dateLabel(last.data.uploaded_at, true)}
                            </small>
                          </div>
                        </div>
                        <span
                          className={
                            last.data.status === "SUCCESS"
                              ? "positive"
                              : "negative"
                          }
                        >
                          {last.data.status === "SUCCESS"
                            ? `${last.data.rows_imported} operações adicionadas · ${last.data.rows_duplicate} já existentes`
                            : last.data.error_message || "Processando"}
                        </span>
                      </>
                    ) : (
                      <p className="hint">Nenhum relatório recebido.</p>
                    )}
                  </section>
                </div>
              </div>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">UMA VISÃO DE CADA MESA</span>
                  <h2>Desempenho por conta</h2>
                </div>
                <span>{all.data?.length || 0} contas</span>
              </div>
              <div className="accounts-grid">
                {all.data?.map((a) => (
                  <button
                    className={`account-card panel ${accountId === a.id ? "chosen" : ""}`}
                    key={a.id}
                    onClick={() => setAccountId(a.id)}
                  >
                    <div className="account-card-top">
                      <span className="section-icon">
                        <Layers size={20} />
                      </span>
                      <span className={`badge ${a.status.toLowerCase()}`}>
                        {statuses[a.status]}
                      </span>
                      <ArrowUpRight size={18} />
                    </div>
                    <h3>{accountName(a)}</h3>
                    <small>Conta {a.account_number}</small>
                    <strong>{money(a.result)}</strong>
                    <span className="hint">Resultado acumulado</span>
                    <div className="account-stats">
                      <span>
                        Limite contratado<b>{money(a.initial_capital)}</b>
                      </span>
                      <span>
                        Resultado / limite
                        <b
                          className={
                            Number(a.return_pct) < 0 ? "negative" : "positive"
                          }
                        >
                          {percent(a.return_pct)}
                        </b>
                      </span>
                      <span>
                        Saldo operacional<b>{money(a.balance)}</b>
                      </span>
                      <span>
                        Margem até a perda<b>{money(a.risk_remaining)}</b>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {editing && (
        <AccountForm account={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
