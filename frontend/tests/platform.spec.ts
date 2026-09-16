import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
const local = path.resolve(process.cwd(), "../.local");
const credentials = JSON.parse(
  readFileSync(path.join(local, "e2e.json"), "utf8"),
);

test("private platform lifecycle, import, settlement and responsive views", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Acesso privado aos sócios" }),
  ).toBeVisible();
  await expect(page.locator(".login-card")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: path.join(local, "login-desktop.png") });
  await page.getByLabel("E-mail", { exact: true }).fill(credentials.email);
  await page.getByLabel("Senha", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  await page.goto("/admin?tab=imports");
  await expect(
    page.getByRole("tab", { name: "Importação", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(local, "browser-report.csv"));
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Apelido da conta").fill("Fenix Principal");
  await page.getByLabel("Capital inicial / limite de perda (R$)").fill("15000");
  await page.getByLabel("Data de início", { exact: true }).fill("2026-01-01");
  await page.getByRole("button", { name: "Salvar configuração" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("tab", { name: /Contas e configurações/ }).click();
  for (const [number, nickname, capital] of [
    ["DEMO002", "Fenix Expansão", "20000"],
    ["DEMO003", "Fenix Alpha", "10000"],
  ]) {
    await page
      .getByRole("row")
      .filter({ hasText: number })
      .getByRole("button", { name: "Configurar" })
      .click();
    await page.getByLabel("Apelido da conta").fill(nickname);
    await page
      .getByLabel("Capital inicial / limite de perda (R$)")
      .fill(capital);
    await page.getByLabel("Data de início", { exact: true }).fill("2026-01-01");
    await page.getByRole("button", { name: "Salvar configuração" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.getByRole("tab", { name: "Usuários", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar usuário" }).click();
  const partnerEmail = `browser-partner-${Date.now()}@example.com`;
  await page.getByLabel("Nome", { exact: true }).fill("Sócio de Teste");
  await page.getByLabel("E-mail", { exact: true }).fill(partnerEmail);
  await page
    .getByRole("button", { name: "Criar e gerar senha temporária" })
    .click();
  await expect(page.locator(".temporary-secret")).toBeVisible();
  const temporary = (
    await page.locator(".temporary-secret").innerText()
  ).trim();
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await page.screenshot({ path: path.join(local, "admin-desktop.png") });
  await page.goto("/closings");
  await page
    .locator(".pending-card")
    .filter({ hasText: "Fenix Principal" })
    .getByRole("button", { name: "Conferir e fechar" })
    .click();
  await page.getByLabel("Resultado confirmado do mês (R$)").fill("800.00");
  await page
    .getByLabel(/Observação/)
    .fill("Ajuste de teste confirmado pela mesa");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Confirmar fechamento e dar baixa" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: /720,00/ })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.locator(".account-card")).toHaveCount(3);
  await page
    .locator(".account-card")
    .filter({ hasText: "Fenix Principal" })
    .click();
  await expect(page.locator(".desk-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Voltar para todas as contas" })
    .click();
  await expect(page.locator(".desk-row")).toHaveCount(3);
  await page.screenshot({
    path: path.join(local, "dashboard-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: path.join(local, "dashboard-mobile.png"),
    fullPage: true,
  });
  await page.locator(".profile-button").click();
  await page.getByRole("button", { name: "Sair desta sessão" }).click();
  await expect(page).toHaveURL(/login/);
  await expect(page.locator(".login-card")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: path.join(local, "login-mobile.png") });
  await page.getByLabel("E-mail", { exact: true }).fill(partnerEmail);
  await page.getByLabel("Senha", { exact: true }).fill(temporary);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/change-password/);
  await page.getByLabel("Senha atual ou temporária").fill(temporary);
  await page.getByLabel(/^Nova senha/).fill("browser-permanent-password");
  await page
    .getByLabel("Confirme a nova senha")
    .fill("browser-permanent-password");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/dashboard/);
  expect(errors).toEqual([]);
});

test("reduced motion, keyboard login and protected API", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await expect(page.locator(".phoenix")).toHaveCSS("animation-name", "none");
  const response = await page.request.get("/api/dashboard");
  expect(response.status()).toBe(401);
  await page.getByLabel("E-mail", { exact: true }).fill("missing@example.com");
  await page.getByLabel("Senha", { exact: true }).fill("invalid-password");
  await page.getByLabel("Senha", { exact: true }).press("Enter");
  await expect(page.locator(".notice.error")).toContainText(
    "Credenciais inválidas",
  );
  await expect(page).toHaveURL(/login/);
  const csp = (await page.request.get("/login")).headers()[
    "content-security-policy"
  ];
  expect(csp).toContain("'nonce-");
});
