"use client";
import { useState } from "react";
import { Account, AccountConfiguration, Batch, accountName } from "@/lib/types";
import { api } from "@/lib/api";
import { AccountForm } from "./account-form";
import { Modal, ErrorNotice } from "./ui";

export type ImportAccount = {
  number: string;
  account_number: string;
  original_name: string;
  first_trade_date: string;
  trade_count: number;
  accounts: Account[];
};
type Choice = { account_id: string } | { configuration: AccountConfiguration };

export function ImportDestinations({ file, accounts, onClose, onImported }: {
  file: File;
  accounts: ImportAccount[];
  onClose: () => void;
  onImported: (result: { batch: Batch; new_accounts: Account[] }) => Promise<void>;
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [editing, setEditing] = useState<ImportAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("destinations", JSON.stringify(choices));
      const result = await api<{ batch: Batch; new_accounts: Account[] }>("/imports/csv", { method: "POST", body: form });
      await onImported(result);
      onClose();
    } catch (e) { setError(e); }
    finally { setBusy(false); }
  }
  if (editing) return <AccountForm
    key={editing.number}
    account={{ account_number: editing.account_number, original_name: editing.original_name, first_trade_date: editing.first_trade_date, is_new: true }}
    onSave={async configuration => { setChoices(previous => ({ ...previous, [editing.number]: { configuration } })); }}
    onClose={() => setEditing(null)}
  />;
  return <Modal title="Destino do relatório" description={file.name} onClose={() => { if (!busy) onClose(); }}>
    <p>O número da conta pode ser compartilhado por várias mesas. Confirme onde este relatório deve entrar. Períodos iguais são permitidos em mesas diferentes.</p>
    <div className="form-stack">
      {accounts.map(a => {
        const choice = choices[a.number];
        return <fieldset key={a.number} disabled={busy}>
          <legend>Conta {a.account_number} · {a.trade_count} operações</legend>
          <p className="hint">{a.original_name}</p>
          <label>Destino<select value={choice && "account_id" in choice ? choice.account_id : choice ? "new" : ""} onChange={e => {
            if (e.target.value === "new") setEditing(a);
            else setChoices(previous => ({ ...previous, [a.number]: { account_id: e.target.value } }));
          }}>
            <option value="" disabled>Escolha o destino deste relatório</option>
            {a.accounts.map(existing => <option key={existing.id} value={existing.id} disabled={existing.status === "UNCONFIGURED"}>
              {accountName(existing)}{existing.status === "UNCONFIGURED" ? " (configure em Contas)" : ""}
            </option>)}
            <option value="new">Cadastrar outra mesa / conta</option>
          </select></label>
          {choice && "configuration" in choice && <p className="notice success">
            Configuração completa: {choice.configuration.is_proprietary ? choice.configuration.new_desk_name || "Mesa selecionada" : "Conta própria"}.
          </p>}
          <button type="button" className="button small" onClick={() => setEditing(a)}>Configurar novo destino</button>
        </fieldset>;
      })}
      <ErrorNotice error={error} />
      <button className="button gold" disabled={busy || accounts.some(a => !choices[a.number])} onClick={confirm}>
        {busy ? "Importando…" : "Confirmar destino e importar"}
      </button>
    </div>
  </Modal>;
}
