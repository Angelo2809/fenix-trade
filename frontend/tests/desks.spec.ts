import { test, expect } from "@playwright/test";

test("import requires destination and explicit proprietary choice before registering", async ({ page }) => {
  let imported: string | null = null;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/imports/csv") {
      imported = route.request().postData();
      await route.fulfill({ json: { batch: { rows_imported: 1, rows_duplicate: 0 }, new_accounts: [] } });
      return;
    }
    const user = { id: "test", name: "Test Admin", role: "ADMIN", must_change_password: false };
    const data = path === "/api/auth/me" ? user : path === "/api/imports/preview" ? { accounts: [{
      number: "12345", account_number: "12345", original_name: "Test", first_trade_date: "2026-01-01", trade_count: 1, accounts: [],
    }] } : path === "/api/desks" ? [{ id: "mesa1", name: "Mesa existente" }] : [];
    await route.fulfill({ json: data });
  });
  await page.goto("/admin?tab=imports");
  await page.locator('input[type="file"]').setInputFiles({ name: "report.csv", mimeType: "text/csv", buffer: Buffer.from("fixture") });
  await expect(page.getByRole("button", { name: "Confirmar destino e importar" })).toBeDisabled();
  expect(imported).toBeNull();
  await page.getByRole("combobox", { name: "Destino", exact: true }).selectOption("new");
  const yes = page.getByRole("radio", { name: "Sim", exact: true });
  const no = page.getByRole("radio", { name: "Não", exact: true });
  await expect(yes).not.toBeChecked();
  await expect(no).not.toBeChecked();
  await yes.check();
  await expect(page.getByRole("combobox", { name: "Mesa proprietária", exact: true })).toHaveValue("");
  await page.getByLabel("Nova mesa proprietária", { exact: true }).check();
  await page.getByLabel("Nome da nova mesa proprietária").fill("Mesa B");
  await page.getByLabel("Capital inicial / limite de perda (R$)").fill("10000");
  for (const label of ["Construção de margem · WIN", "Construção de margem · WDO", "Conta real · WIN", "Conta real · WDO"]) {
    await page.getByLabel(label, { exact: true }).fill("0.50");
  }
  await page.getByRole("button", { name: "Confirmar configuração" }).click();
  expect(imported).toBeNull();
  await page.getByRole("button", { name: "Confirmar destino e importar" }).click();
  await expect(page.getByText("1 operações importadas.", { exact: false })).toBeVisible();
  expect(imported).toContain('"is_proprietary":true');
  expect(imported).toContain('"new_desk_name":"Mesa B"');
});
