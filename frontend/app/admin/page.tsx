"use client";
import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UsersRound,
  UploadCloud,
  Layers,
  Plus,
  Pencil,
  KeyRound,
  ShieldOff,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Clock3,
  Copy,
  ArrowRight,
  CircleHelp,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { Modal, Loading, ErrorNotice, Empty } from "@/components/ui";
import { AccountForm } from "@/components/account-form";
import { api, post, dateLabel, money } from "@/lib/api";
import { Account, Batch, User, accountName } from "@/lib/types";
export default function AdminPage() {
  return <Shell adminOnly>{(user) => <Admin user={user} />}</Shell>;
}
function Admin({ user }: { user: User }) {
  const [tab, setTab] = useState(() => {
      if (typeof window === "undefined") return "users";
      const initial = new URLSearchParams(window.location.search).get("tab");
      return initial && ["users", "imports", "accounts"].includes(initial)
        ? initial
        : "users";
    }),
    [editUser, setEditUser] = useState<User | "new" | null>(null),
    [editAccount, setEditAccount] = useState<Account | null>(null);
  const [secret, setSecret] = useState<string | null>(null),
    [copied, setCopied] = useState(false),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    target: User;
    action: "reset-access" | "revoke-sessions";
  } | null>(null);
  const query = useQueryClient();
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<User[]>("/admin/users"),
  });
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<Account[]>("/accounts"),
  });
  async function saveUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (editUser === "new") {
        const result = await post<{ temporary_password: string }>(
          "/admin/users",
          values,
        );
        setCopied(false);
        setSecret(result.temporary_password);
      } else if (editUser)
        await api(`/admin/users/${editUser.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...values,
            is_active: values.is_active === "on",
          }),
        });
      setEditUser(null);
      await query.invalidateQueries();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function confirmAction() {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      const result = await post<{ temporary_password?: string }>(
        `/admin/users/${confirm.target.id}/${confirm.action}`,
      );
      if (result.temporary_password) {
        setCopied(false);
        setSecret(result.temporary_password);
      }
      setConfirm(null);
      await query.invalidateQueries();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading admin-heading">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO</span>
          <h1>Usuários e importação</h1>
          <p>Gerencie os acessos e mantenha os resultados atualizados.</p>
        </div>
        <div className="heading-phoenix" aria-hidden="true">
          <div className="phoenix">
            <img className="wing wing-right" src="/assets/fenix/wing-right.png" alt="" />
            <img className="wing wing-left" src="/assets/fenix/wing-left.png" alt="" />
            <img className="phoenix-body" src="/assets/fenix/body.png" alt="" />
          </div>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Administração">
        {[
          { id: "users", label: "Usuários", Icon: UsersRound },
          { id: "imports", label: "Importação", Icon: UploadCloud },
          { id: "accounts", label: "Contas e configurações", Icon: Layers },
        ].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t.id}
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            <t.Icon size={18} />
            {t.label}
            {t.id === "accounts" &&
              !!accounts.data?.filter((a) => a.is_new).length && (
                <span className="tab-count">
                  {accounts.data.filter((a) => a.is_new).length}
                </span>
              )}
          </button>
        ))}
      </div>
      {tab === "users" && (
        <section className="panel">
          <div className="panel-heading">
            <div className="panel-title">
              <UsersRound />
              <div>
                <h2>Usuários da plataforma</h2>
                <p>Apenas convidados têm acesso à Fenix.</p>
              </div>
            </div>
            <button
              className="button gold-outline"
              onClick={() => {
                setError(null);
                setEditUser("new");
              }}
            >
              <Plus size={18} />
              Adicionar usuário
            </button>
          </div>
          <ErrorNotice error={users.error} />
          {users.isLoading ? (
            <Loading />
          ) : (
            <div className="table-scroll">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Função</th>
                    <th>Status</th>
                    <th>Último acesso</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data?.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="table-person">
                          <span className="avatar">
                            {u.name
                              .split(" ")
                              .map((s) => s[0])
                              .slice(0, 2)
                              .join("")}
                          </span>
                          <div>
                            <b>{u.name}</b>
                            <small>{u.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge">
                          {u.role === "ADMIN" ? "Administrador" : "Sócio"}
                        </span>
                      </td>
                      <td>
                        <span className={u.is_active ? "positive" : "muted"}>
                          {u.is_active ? "● Ativo" : "○ Inativo"}
                        </span>
                        {u.must_change_password && (
                          <small>Primeiro acesso pendente</small>
                        )}
                      </td>
                      <td>{dateLabel(u.last_login_at, true)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="button small"
                            onClick={() => {
                              setError(null);
                              setEditUser(u);
                            }}
                          >
                            <Pencil size={15} />
                            Editar
                          </button>
                          {u.id !== user.id && (
                            <>
                              <button
                                className="button small"
                                onClick={() => {
                                  setError(null);
                                  setConfirm({
                                    target: u,
                                    action: "reset-access",
                                  });
                                }}
                              >
                                <KeyRound size={15} />
                                Resetar acesso
                              </button>
                              <button
                                className="icon-button"
                                title="Revogar sessões"
                                aria-label={`Revogar sessões de ${u.name}`}
                                onClick={() => {
                                  setError(null);
                                  setConfirm({
                                    target: u,
                                    action: "revoke-sessions",
                                  });
                                }}
                              >
                                <ShieldOff size={18} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {tab === "imports" && <ImportSection onNewAccount={setEditAccount} />}
      {tab === "accounts" && (
        <section className="panel">
          <div className="panel-heading">
            <div className="panel-title">
              <Layers />
              <div>
                <h2>Contas de investimento</h2>
                <p>Detectadas automaticamente nos relatórios CSV.</p>
              </div>
            </div>
          </div>
          <ErrorNotice error={accounts.error} />
          {accounts.isLoading ? (
            <Loading />
          ) : !accounts.data?.length ? (
            <Empty title="Nenhuma conta importada">
              <button className="button gold" onClick={() => setTab("imports")}>
                Importar relatório
                <ArrowRight size={18} />
              </button>
            </Empty>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Conta / apelido</th>
                    <th>Nome no relatório</th>
                    <th>Limite contratado</th>
                    <th>Início</th>
                    <th>Primeira / última importação</th>
                    <th>Configuração</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.data.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <b>{accountName(a)}</b>
                        <small>Conta {a.account_number}</small>
                      </td>
                      <td>{a.original_name}</td>
                      <td>{money(a.initial_capital)}</td>
                      <td>{dateLabel(a.start_date)}</td>
                      <td>
                        <small>{dateLabel(a.first_seen_at, true)}</small>
                        <small>{dateLabel(a.last_seen_at, true)}</small>
                      </td>
                      <td>
                        <div className="table-actions">
                          {a.is_new && <span className="badge">NOVA</span>}
                          <button
                            className="button small"
                            onClick={() => setEditAccount(a)}
                          >
                            <Pencil size={15} />
                            Configurar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {tab === "users" && (
        <ImportSection onNewAccount={setEditAccount} compact />
      )}
      {editUser && (
        <Modal
          title={editUser === "new" ? "Adicionar usuário" : "Editar usuário"}
          description="A senha temporária será gerada com segurança pela plataforma."
          onClose={() => setEditUser(null)}
        >
          <form className="form-stack" onSubmit={saveUser}>
            <label>
              Nome
              <input
                name="name"
                minLength={2}
                maxLength={160}
                required
                defaultValue={editUser === "new" ? "" : editUser.name}
              />
            </label>
            <label>
              E-mail
              <input
                name="email"
                type="email"
                required
                defaultValue={editUser === "new" ? "" : editUser.email}
              />
            </label>
            <label>
              Função
              <select
                name="role"
                defaultValue={editUser === "new" ? "PARTNER" : editUser.role}
              >
                <option value="PARTNER">Sócio</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </label>
            {editUser !== "new" && (
              <>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked={editUser.is_active}
                  />
                  Usuário ativo
                </label>
                <p className="hint">
                  Salvar as alterações revoga as sessões deste usuário.
                  Desativar remove seu acesso.
                </p>
                <label className="checkbox-label">
                  <input type="checkbox" required />
                  Confirmo a atualização e a revogação das sessões.
                </label>
              </>
            )}
            <ErrorNotice error={error} />
            <button className="button gold" disabled={busy}>
              {busy
                ? "Salvando…"
                : editUser === "new"
                  ? "Criar e gerar senha temporária"
                  : "Confirmar alterações"}
            </button>
          </form>
        </Modal>
      )}
      {secret && (
        <Modal
          title="Acesso criado"
          description="Esta senha temporária será exibida apenas uma vez."
          onClose={() => setSecret(null)}
        >
          <p>
            Compartilhe-a por um canal privado. No primeiro acesso, o usuário
            deverá criar a própria senha.
          </p>
          <code className="temporary-secret">{secret}</code>
          <button
            className="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            <Copy size={17} />
            {copied ? "Senha copiada" : "Copiar senha"}
          </button>
          <button className="button gold" onClick={() => setSecret(null)}>
            Concluir
          </button>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            confirm.action === "reset-access"
              ? "Resetar acesso?"
              : "Revogar sessões?"
          }
          description={confirm.target.name}
          onClose={() => setConfirm(null)}
        >
          <p>
            {confirm.action === "reset-access"
              ? "A senha atual será invalidada e todos os dispositivos serão desconectados. Uma nova senha temporária será exibida uma única vez."
              : "Todos os dispositivos deste usuário serão desconectados. Ele poderá entrar novamente com sua senha atual."}
          </p>
          <ErrorNotice error={error} />
          <button
            className="button gold"
            disabled={busy}
            onClick={confirmAction}
          >
            {busy ? "Aguarde…" : "Confirmar"}
          </button>
        </Modal>
      )}
      {editAccount && (
        <AccountForm
          account={editAccount}
          onClose={() => setEditAccount(null)}
        />
      )}
    </>
  );
}
function ImportSection({
  onNewAccount,
  compact = false,
}: {
  onNewAccount: (a: Account) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [success, setSuccess] = useState<Batch | null>(null),
    [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    query = useQueryClient();
  const batches = useQuery({
    queryKey: ["imports"],
    queryFn: () => api<Batch[]>("/imports"),
  });
  async function upload(file?: File) {
    if (!file || busy) return;
    setError(null);
    setSuccess(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Selecione um relatório .csv.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("O arquivo excede 10 MB.");
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const result = await api<{ batch: Batch; new_accounts: Account[] }>(
        "/imports/csv",
        { method: "POST", body: form },
      );
      setSuccess(result.batch);
      await query.invalidateQueries();
      if (result.new_accounts.length) onNewAccount(result.new_accounts[0]);
    } catch (e) {
      setError(e);
      await query.invalidateQueries({ queryKey: ["imports"] });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className={`import-grid ${compact ? "compact-import" : ""}`}>
      <section className="panel">
        <div className="panel-heading">
          <div className="panel-title">
            <FileSpreadsheet />
            <div>
              <h2>Upload do relatório atualizado</h2>
              <p>Importe o CSV de desempenho com as operações da mesa.</p>
            </div>
          </div>
        </div>
        <div
          className={`dropzone ${drag ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void upload(e.dataTransfer.files[0]);
          }}
        >
          <FileSpreadsheet size={43} strokeWidth={1.2} />
          <h3>
            {busy
              ? "Validando e importando…"
              : "Arraste e solte o arquivo aqui"}
          </h3>
          <p>ou selecione o relatório no seu computador</p>
          <input
            ref={input}
            aria-label="Arquivo CSV"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void upload(e.target.files?.[0])}
            hidden
          />
          <button
            className="button gold"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <UploadCloud size={18} />
            {busy ? "Processando…" : "Selecionar arquivo CSV"}
          </button>
          <small>Formato .csv · até 10 MB · UTF-8 ou Windows-1252</small>
        </div>
        <ErrorNotice error={error} />
        {success && (
          <p className="notice success" role="status">
            <CheckCircle2 size={19} />
            {success.rows_imported} operações importadas.{" "}
            {success.rows_duplicate} já existentes foram preservadas.
          </p>
        )}
        <p className="upload-tip">
          <CircleHelp size={19} />
          Use o relatório exportado pela plataforma de operações. Reenvios
          idênticos não duplicam os resultados.
        </p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div className="panel-title">
            <Clock3 />
            <h2>Histórico de uploads</h2>
          </div>
        </div>
        <ErrorNotice error={batches.error} />
        {batches.isLoading ? (
          <Loading />
        ) : !batches.data?.length ? (
          <Empty title="Nenhum upload realizado">
            <p>As validações aparecerão aqui após a primeira importação.</p>
          </Empty>
        ) : (
          <div className="upload-history">
            {batches.data.slice(0, compact ? 4 : 30).map((b) => (
              <div className="history-row" key={b.id}>
                {b.status === "SUCCESS" ? (
                  <CheckCircle2 className="positive" size={21} />
                ) : b.status === "FAILED" ? (
                  <XCircle className="negative" size={21} />
                ) : (
                  <Clock3 size={21} />
                )}
                <div>
                  <b>{b.filename}</b>
                  <small>{dateLabel(b.uploaded_at, true)}</small>
                  <small>
                    {b.status === "SUCCESS"
                      ? `${b.rows_imported} novas · ${b.rows_duplicate} já existentes`
                      : b.error_message || "Em processamento"}
                  </small>
                </div>
                <span
                  className={`badge ${b.status === "SUCCESS" ? "active" : ""}`}
                >
                  {b.status === "SUCCESS"
                    ? "Processado"
                    : b.status === "FAILED"
                      ? "Falhou"
                      : "Em andamento"}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="validation-note">
          <ShieldOff size={19} />
          <p>
            Importação transacional: um erro impede a gravação parcial. Meses
            fechados permanecem protegidos.
          </p>
        </div>
      </section>
    </div>
  );
}
