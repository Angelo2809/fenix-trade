"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck2,
  ArrowRight,
  CircleCheck,
  Coins,
  Info,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { Modal, ErrorNotice, Empty, Loading } from "@/components/ui";
import { api, post, money, monthLabel, dateLabel } from "@/lib/api";
import { Account, Close, User, accountName } from "@/lib/types";
export default function ClosingsPage() {
  return <Shell>{(user) => <Content user={user} />}</Shell>;
}
function Content({ user }: { user: User }) {
  const query = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<Account[]>("/accounts"),
  });
  const [closing, setClosing] = useState<Account | null>(null),
    [selected, setSelected] = useState("");
  const accounts = query.data || [],
    id = selected || accounts[0]?.id;
  const history = useQuery({
    queryKey: ["closes", id],
    queryFn: () => api<Close[]>(`/accounts/${id}/closes`),
    enabled: !!id,
  });
  const pending = accounts.filter((a) => a.pending_months.length);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">RESULTADOS QUE SE REALIZAM</span>
          <h1>Fechamentos mensais</h1>
          <p>
            Confira o desempenho, registre o repasse e siga para o próximo mês.
          </p>
        </div>
        <span className="heading-icon">
          <CalendarCheck2 size={35} />
        </span>
      </div>
      <div className="closing-explanation panel">
        <div>
          <Coins />
          <strong>90% para os sócios</strong>
          <p>Sobre o lucro disponível após compensar perdas anteriores.</p>
        </div>
        <div>
          <CalendarCheck2 />
          <strong>Baixa no fechamento</strong>
          <p>O lucro é baixado por inteiro: 90% de repasse e 10% da mesa.</p>
        </div>
        <div>
          <Info />
          <strong>Calculado e confirmado</strong>
          <p>
            O resultado original permanece visível quando houver ajuste manual.
          </p>
        </div>
      </div>
      <ErrorNotice error={query.error} />
      {query.isLoading ? (
        <Loading />
      ) : !accounts.length ? (
        <section className="panel">
          <Empty title="Importe e configure sua primeira mesa">
            <p>Os meses encerrados ficarão disponíveis para fechamento aqui.</p>
          </Empty>
        </section>
      ) : (
        <>
          <div className="section-heading">
            <h2>Pendentes de fechamento</h2>
            <span>
              {pending.length} {pending.length === 1 ? "conta" : "contas"}
            </span>
          </div>
          {!pending.length ? (
            <section className="panel up-to-date">
              <CircleCheck className="positive" />
              <div>
                <h3>Tudo em dia</h3>
                <p>
                  No começo de cada mês, o período anterior ficará disponível
                  para fechamento.
                </p>
              </div>
            </section>
          ) : (
            <div className="accounts-grid">
              {pending.map((a) => (
                <section className="panel pending-card" key={a.id}>
                  <span className="badge">MÊS ENCERRADO</span>
                  <h3>{accountName(a)}</h3>
                  <small>Conta {a.account_number}</small>
                  <strong>{monthLabel(a.pending_months[0])}</strong>
                  <p>
                    {a.pending_months.length}{" "}
                    {a.pending_months.length === 1
                      ? "mês pendente"
                      : "meses pendentes"}{" "}
                    · fechamento em ordem cronológica
                  </p>
                  {user.role === "ADMIN" ? (
                    <button
                      className="button gold"
                      onClick={() => setClosing(a)}
                    >
                      Conferir e fechar
                      <ArrowRight size={17} />
                    </button>
                  ) : (
                    <p className="hint">Aguardando o administrador.</p>
                  )}
                </section>
              ))}
            </div>
          )}
          <section className="panel closing-history">
            <div className="panel-heading">
              <div className="panel-title">
                <CalendarCheck2 />
                <h2>Histórico de fechamentos</h2>
              </div>
              <select
                aria-label="Conta do histórico"
                value={id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {accounts.map((a) => (
                  <option value={a.id} key={a.id}>
                    {accountName(a)} · {a.account_number}
                  </option>
                ))}
              </select>
            </div>
            <ErrorNotice error={history.error} />
            {history.isLoading ? (
              <Loading />
            ) : !history.data?.length ? (
              <Empty title="Nenhum fechamento nesta conta" />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th>Calculado (CSV)</th>
                      <th>Confirmado</th>
                      <th>Repasse 90%</th>
                      <th>Saldo seguinte</th>
                      <th>Registro / ajuste</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.map((c) => (
                      <tr key={c.id}>
                        <td>{monthLabel(c.month)}</td>
                        <td>{money(c.calculated_result)}</td>
                        <td>{money(c.confirmed_result)}</td>
                        <td className="positive">{money(c.payout)}</td>
                        <td>{money(c.closing_balance)}</td>
                        <td>
                          <small>{dateLabel(c.closed_at, true)}</small>
                          <small>{c.note || "Sem ajuste manual"}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {closing && (
        <CloseModal account={closing} onClose={() => setClosing(null)} />
      )}
    </>
  );
}
function CloseModal({
  account,
  onClose,
}: {
  account: Account;
  onClose: () => void;
}) {
  const month = account.pending_months[0],
    query = useQueryClient();
  const preview = useQuery({
    queryKey: ["close-preview", account.id, month],
    queryFn: () =>
      api<Close>(`/accounts/${account.id}/close-preview?month=${month}`),
  });
  const [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [override, setOverride] = useState<string | null>(null);
  const p = preview.data,
    value = override ?? p?.calculated_result ?? "",
    changed = p && Number(value) !== Number(p.calculated_result);
  // Preview only. Authoritative Decimal calculation and validation happen in the API.
  const available = p ? Number(p.opening_balance) + Number(value) : 0;
  const lost = !!p?.lost || available <= -Number(account.initial_capital);
  const payout = lost ? 0 : Math.round(Math.max(0, available) * 90) / 100;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      await post(`/accounts/${account.id}/closes`, {
        month,
        confirmed_result: value,
        note: form.get("note"),
      });
      await query.invalidateQueries();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Fechar ${monthLabel(month)}`}
      description={`${accountName(account)} · Conta ${account.account_number}`}
      onClose={onClose}
    >
      {preview.isLoading ? (
        <Loading />
      ) : p ? (
        <form className="form-stack" onSubmit={submit}>
          <div className="settlement-values">
            <span>
              Saldo anterior<b>{money(p.opening_balance)}</b>
            </span>
            <span>
              Resultado calculado pelo CSV<b>{money(p.calculated_result)}</b>
            </span>
          </div>
          <label>
            Resultado confirmado do mês (R$)
            <input
              type="number"
              step="0.01"
              min="-999999999999.99"
              max="999999999999.99"
              value={value}
              onChange={(e) => setOverride(e.target.value)}
              required
            />
            <small>
              Altere se o resultado informado pela mesa for diferente.
            </small>
          </label>
          <label>
            Observação {changed ? "(obrigatória para ajustes)" : "(opcional)"}
            <textarea
              name="note"
              maxLength={1000}
              minLength={changed ? 5 : undefined}
              required={!!changed}
              placeholder="Motivo do ajuste ou referência do pagamento"
            />
          </label>
          <div className="settlement-values payout-preview">
            <span>
              Repasse estimado (90%)<b>{money(payout)}</b>
            </span>
            <span>
              Saldo para o próximo mês
              <b>{money(lost ? available : Math.min(0, available))}</b>
            </span>
          </div>
          {lost && (
            <p className="notice error">
              O limite de perda foi atingido. Esta mesa não gera repasse.
            </p>
          )}
          <label className="checkbox-label">
            <input type="checkbox" required />
            Conferi o relatório completo e confirmo a baixa deste mês. Novas
            operações deste mês não poderão ser importadas.
          </label>
          <ErrorNotice error={error} />
          <button className="button gold" disabled={busy}>
            {busy ? "Registrando…" : "Confirmar fechamento e dar baixa"}
          </button>
        </form>
      ) : null}
      <ErrorNotice error={preview.error} />
    </Modal>
  );
}
