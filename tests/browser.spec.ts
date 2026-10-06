import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const access = readFileSync(".data/acesso-inicial.txt", "utf8");
const email = access.match(/E-mail: (.+)/)![1];
const password = access.match(/Senha: (.+)/)![1];
test("fluxo de negócio e interface mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  await expect(
    page.getByRole("heading", { name: "Olá, equipe AXL" }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Clientes", exact: true })
    .click();
  await page.getByRole("button", { name: "Novo cliente" }).click();
  const dialog = page.getByRole("dialog");
  const customer = "Teste navegador " + Date.now();
  await dialog.getByLabel("Nome fantasia").fill(customer);
  await dialog.getByLabel("Cidade", { exact: true }).fill("Valinhos");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByPlaceholder("Pesquisar registros…").fill(customer);
  await page.getByRole("button", { name: "Abrir ficha" }).click();
  await expect(page.getByRole("heading", { name: customer })).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Registrar venda" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Produto", exact: true })
    .selectOption({ label: "Placa Google NFC 10x10" });
  await page
    .getByRole("dialog")
    .getByRole("spinbutton", { name: "Quantidade item 1", exact: true })
    .fill("2");
  await page.getByRole("dialog").getByLabel("Recebido agora (R$)").fill("30");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Registrar venda", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Vendas", exact: true })
    .click();
  await page.getByPlaceholder("Pesquisar registros…").fill(customer);
  await expect(page.getByText("R$ 120,00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Receber", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Valor recebido (R$)").fill("90");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await expect(page.getByText("Pago", { exact: true })).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Dashboard", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Faturamento por dia" }),
  ).toBeVisible();
  await expect(page.locator(".recharts-area-curve")).toHaveCount(1);
  await expect(page.locator(".recharts-sector")).toHaveCount(1);
  await page.screenshot({
    path: "/tmp/axl-dashboard.png",
    fullPage: true,
    animations: "disabled",
  });
  const before = (
    await (await page.request.get("/api/data")).json()
  ).inventory.find((i: { name: string }) => i.name === "Tag NFC").quantity;
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Pedidos", exact: true })
    .click();
  await page
    .locator(".kanban-card")
    .filter({ hasText: customer })
    .getByRole("button", { name: "Atualizar pedido" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption({ label: "Arte aprovada" });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".kanban-card")
    .filter({ hasText: customer })
    .getByRole("button", { name: "Marcar produzido" })
    .click();
  await expect(
    page
      .locator(".kanban-column")
      .filter({
        has: page.getByRole("heading", { name: /Pronto para entrega/ }),
      })
      .getByText(customer),
  ).toBeVisible();
  const after = (
    await (await page.request.get("/api/data")).json()
  ).inventory.find((i: { name: string }) => i.name === "Tag NFC").quantity;
  expect(after).toBe(before - 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Central do Dia", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sua próxima conquista" }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/axl-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("recuperação preserva tokens em memória e permite definir uma nova senha", async ({
  page,
}) => {
  let submitted = false;
  await page.route("**/api/auth/recovery", async (route) => {
    const data = route.request().postDataJSON();
    expect(data.action).toBe("reset");
    expect(data.access_token).toBe("fixture-access-token-only");
    submitted = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.goto(
    "/login#type=recovery&access_token=fixture-access-token-only&refresh_token=fixture-refresh-token-only",
  );
  await expect(page).toHaveURL(/\/reset-password$/);
  await page
    .getByLabel("Nova senha", { exact: true })
    .fill("NovaSenhaTeste!2026");
  await page.getByLabel("Confirmar senha").fill("DiferenteTeste!2026");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(
    page.getByText("As senhas precisam ser iguais.", { exact: true }),
  ).toBeVisible();
  expect(submitted).toBe(false);
  await page.getByLabel("Confirmar senha").fill("NovaSenhaTeste!2026");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByRole("status")).toContainText("Senha atualizada");
  expect(submitted).toBe(true);
  await page.getByRole("link", { name: "Voltar para entrar" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("histórico importado mostra datas originais e exclui pagamentos/custos desconhecidos", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  await expect(
    page.getByRole("heading", { name: "Olá, equipe AXL" }),
  ).toBeVisible();
  const original = await (await page.request.get("/api/data")).json();
  const company = {
    ...original.companies[0],
    id: "fixture-company",
    name: "Histórico validado",
    is_customer: 1,
    is_lead: 0,
  };
  const base = {
    company_id: company.id,
    company_name: company.name,
    date: "",
    total: 28000,
    cost: 0,
    profit: 0,
    plates: 6,
    paid: 0,
    method: "Não informado",
    due_date: "",
    notes: "Original da planilha",
    commission: 0,
    commission_rule: "{}",
    import_source: "fixture.xlsx",
    cost_known: 0,
    payment_known: 0,
  };
  const mock = {
    ...original,
    companies: [company],
    sales: [
      {
        ...base,
        id: "fixture-range",
        number: 1,
        date_label: "26–27/09/2026",
        date_start: "2026-09-26",
        date_end: "2026-09-27",
      },
      {
        ...base,
        id: "fixture-unknown",
        number: 2,
        date_label: "Sem data precisa",
        total: 15000,
        plates: 3,
      },
    ],
    payments: [],
    orders: [],
    saleItems: [],
    expenses: [],
  };
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mock),
    }),
  );
  await page
    .getByRole("button", { name: "Atualizar dados", exact: true })
    .click();
  await expect(page.getByText("Histórico da planilha AXL:")).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Vendas", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "26–27/09/2026", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Sem data precisa", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Receber", exact: true }).first(),
  ).toBeDisabled();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Dashboard", exact: true })
    .click();
  await page
    .getByLabel("Período", { exact: true })
    .selectOption("Todo o histórico");
  await expect(
    page
      .locator(".metric")
      .filter({ has: page.getByText("Faturamento", { exact: true }) }),
  ).toContainText("R$ 430,00");
  await expect(
    page
      .locator(".metric")
      .filter({ has: page.getByText("Lucro bruto", { exact: true }) }),
  ).toContainText("Não informado");
  await expect(
    page
      .locator(".metric")
      .filter({ has: page.getByText("A receber no período", { exact: true }) }),
  ).toContainText("R$ 0,00");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Financeiro", exact: true })
    .click();
  await expect(
    page
      .locator(".metric")
      .filter({ has: page.getByText("A receber", { exact: true }) }),
  ).toContainText("R$ 0,00");
  await expect(
    page.getByText(/Pagamentos de 2 vendas históricas/),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
