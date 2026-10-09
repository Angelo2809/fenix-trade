"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, dateLabel } from "@/lib/api";
import { Account, AccountConfiguration, Desk } from "@/lib/types";
import { Modal, ErrorNotice } from "./ui";
export function AccountForm({
  account,
  onClose,
  onSave,
}: {
  account: Partial<Account> & Pick<Account, "account_number" | "original_name">;
  onClose: () => void;
  onSave?: (configuration: AccountConfiguration) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const [proprietary, setProprietary] = useState<boolean | null>(account.is_proprietary ?? null);
  const [newDesk, setNewDesk] = useState(false);
  const desks = useQuery({ queryKey: ["desks"], queryFn: () => api<Desk[]>("/desks") });
  const query = useQueryClient();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const values = new FormData(e.currentTarget);
    try {
      if (proprietary === null) throw new Error("Escolha Sim ou Não para mesa proprietária.");
      const configuration: AccountConfiguration = {
          nickname: String(values.get("nickname") || "") || null,
          initial_capital: String(values.get("initial_capital")),
          start_date: String(values.get("start_date")),
          construction_win_fee: String(values.get("construction_win_fee")),
          construction_wdo_fee: String(values.get("construction_wdo_fee")),
          real_win_fee: String(values.get("real_win_fee")),
          real_wdo_fee: String(values.get("real_wdo_fee")),
          is_proprietary: proprietary,
          desk_id: proprietary && !newDesk ? String(values.get("desk_id") || account.desk_id || "") : null,
          new_desk_name: proprietary && newDesk ? String(values.get("new_desk_name") || "").trim() : null,
          is_active: values.get("is_active") === "on",
      };
      if (onSave) await onSave(configuration);
      else await api(`/accounts/${account.id}`, { method: "PATCH", body: JSON.stringify(configuration) });
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
        <fieldset>
          <legend>É mesa proprietária? (obrigatório)</legend>
          <label className="checkbox-label"><input type="radio" name="is_proprietary" value="yes" required checked={proprietary === true} onChange={() => setProprietary(true)} disabled={account.is_proprietary != null} />Sim</label>
          <label className="checkbox-label"><input type="radio" name="is_proprietary" value="no" required checked={proprietary === false} onChange={() => setProprietary(false)} disabled={account.is_proprietary != null} />Não</label>
        </fieldset>
        {proprietary && <>
          {account.is_proprietary == null && <label className="checkbox-label"><input type="checkbox" checked={newDesk} onChange={e => setNewDesk(e.target.checked)} />Nova mesa proprietária</label>}
          {newDesk ? <label>Nome da nova mesa proprietária<input name="new_desk_name" maxLength={120} required /></label> :
            <label>Mesa proprietária<select name="desk_id" required defaultValue={account.desk_id || ""} disabled={account.is_proprietary != null}>
              <option value="" disabled>Selecione uma mesa</option>
              {desks.data?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></label>}
          <ErrorNotice error={desks.error} />
        </>}
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
        <strong>Taxas por contrato executado (R$)</strong>
        <p className="hint">
          A taxa incide nos dois lados da operação: quantidade comprada +
          quantidade vendida.
        </p>
        <div className="form-row">
          <label>
            Construção de margem · WIN
            <input
              name="construction_win_fee"
              type="number"
              min="0"
              step="0.01"
              max="99999999.99"
              defaultValue={account.construction_win_fee || ""}
              placeholder="0.50"
              required
            />
          </label>
          <label>
            Construção de margem · WDO
            <input
              name="construction_wdo_fee"
              type="number"
              min="0"
              step="0.01"
              max="99999999.99"
              defaultValue={account.construction_wdo_fee || ""}
              placeholder="1.50"
              required
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Conta real · WIN
            <input
              name="real_win_fee"
              type="number"
              min="0"
              step="0.01"
              max="99999999.99"
              defaultValue={account.real_win_fee || ""}
              placeholder="0.66"
              required
            />
          </label>
          <label>
            Conta real · WDO
            <input
              name="real_wdo_fee"
              type="number"
              min="0"
              step="0.01"
              max="99999999.99"
              defaultValue={account.real_wdo_fee || ""}
              placeholder="1.73"
              required
            />
          </label>
        </div>
        <p className="hint">
          Primeira operação importada: {dateLabel(account.first_trade_date)}.
          Após um fechamento, o limite, a data de início e as taxas ficam
          protegidos contra alterações.
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={account.is_active ?? true}
          />
          Conta ativa
        </label>
        <ErrorNotice error={error} />
        <button className="button gold" disabled={busy}>
          {busy ? "Salvando…" : onSave ? "Confirmar configuração" : "Salvar configuração"}
        </button>
      </form>
    </Modal>
  );
}
