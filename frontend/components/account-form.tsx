"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, dateLabel } from "@/lib/api";
import { Account } from "@/lib/types";
import { Modal, ErrorNotice } from "./ui";
export function AccountForm({
  account,
  onClose,
}: {
  account: Account;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const query = useQueryClient();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const values = new FormData(e.currentTarget);
    try {
      await api(`/accounts/${account.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nickname: values.get("nickname") || null,
          initial_capital: values.get("initial_capital"),
          start_date: values.get("start_date"),
          is_active: values.get("is_active") === "on",
        }),
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
      title={account.is_new ? "Nova conta detectada" : "Configurar conta"}
      description={`Conta ${account.account_number} · ${account.original_name}`}
      onClose={onClose}
    >
      <p>
        Informe o limite de perda contratado e o início da operação. Os
        resultados anteriores à data de início ficam fora dos cálculos desta
        mesa.
      </p>
      <form className="form-stack" onSubmit={submit}>
        <label>
          Apelido da conta
          <input
            name="nickname"
            defaultValue={account.nickname || ""}
            maxLength={120}
            placeholder="Ex.: Fenix Principal"
          />
        </label>
        <div className="form-row">
          <label>
            Capital inicial / limite de perda (R$)
            <input
              name="initial_capital"
              type="number"
              min="0.01"
              step="0.01"
              max="999999999999.99"
              defaultValue={account.initial_capital || ""}
              placeholder="15000.00"
              required
            />
          </label>
          <label>
            Data de início
            <input
              name="start_date"
              type="date"
              min="2000-01-01"
              defaultValue={
                account.start_date || account.first_trade_date || ""
              }
              required
            />
          </label>
        </div>
        <p className="hint">
          Primeira operação importada: {dateLabel(account.first_trade_date)}.
          Após um fechamento, o limite e a data de início ficam protegidos
          contra alterações.
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={account.is_active}
          />
          Conta ativa
        </label>
        <ErrorNotice error={error} />
        <button className="button gold" disabled={busy}>
          {busy ? "Salvando…" : "Salvar configuração"}
        </button>
      </form>
    </Modal>
  );
}
