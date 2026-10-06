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
    .getByLabel("Solução", { exact: true })
    .selectOption({ label: "Placa Google NFC 10x10" });
  await page
    .getByRole("dialog")
    .getByLabel("Quantidade", { exact: true })
    .fill("2");
  await page
    .getByRole("dialog")
    .getByLabel("Valor total da venda (R$)")
    .fill("120");
  await page
    .getByRole("dialog")
    .getByText("Pagamento e dados adicionais", { exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Pagamento", { exact: true })
    .selectOption("partial");
  await page.getByRole("dialog").getByLabel("Valor recebido (R$)").fill("30");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Registrar venda rápida", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Venda registrada" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Completar dados depois" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Vendas", exact: true })
    .click();
  await page.getByPlaceholder("Pesquisar registros…").fill(customer);
  await expect(page.getByText("R$ 120,00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Receber", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Situação confirmada")
    .selectOption("partial");
  await page
    .getByRole("dialog")
    .getByLabel("Valor recebido neste lançamento (R$)")
    .fill("90");
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
    .getByRole("combobox", { name: "Etapa do pedido", exact: true })
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
  await page
    .getByLabel("Período", { exact: true })
    .selectOption("Todo o histórico");
  await expect(
    page.getByRole("cell", { name: "26–27/09/2026", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Sem data precisa", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Receber", exact: true }).first(),
  ).toBeEnabled();
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
    page.locator(".metric").filter({
      has: page.getByText("Resultado bruto parcial / estimado", {
        exact: true,
      }),
    }),
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
      .filter({ has: page.getByText("A receber confirmado", { exact: true }) }),
  ).toContainText("R$ 0,00");
  await expect(
    page.locator(".metric").filter({
      has: page.getByText("Situação desconhecida", { exact: true }),
    }),
  ).toContainText("R$ 430,00");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("colaborador com conta própria compartilha CRM e não administra usuários", async ({
  page,
  browser,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  await expect(
    page.getByRole("heading", { name: "Olá, equipe AXL" }),
  ).toBeVisible();
  const stamp = Date.now();
  const memberEmail = `laura-teste-${stamp}@example.com`;
  const memberPassword = "SomenteTesteLocal!2026";
  const response = await page.request.post("/api/data", {
    headers: { Origin: "http://127.0.0.1:3000" },
    data: {
      action: "user",
      data: {
        name: "Laura teste",
        email: memberEmail,
        password: memberPassword,
        role: "VENDEDOR",
      },
    },
  });
  expect(response.ok()).toBe(true);
  const context = await browser.newContext();
  try {
    const member = await context.newPage();
    await member.goto("/login");
    await member.getByLabel("E-mail", { exact: true }).fill(memberEmail);
    await member.getByLabel("Senha", { exact: true }).fill(memberPassword);
    await member.getByRole("button", { name: "Entrar na plataforma" }).click();
    await expect(
      member.getByRole("heading", { name: "Olá, equipe AXL" }),
    ).toBeVisible();
    await expect(
      member.getByText("Colaborador", { exact: true }),
    ).toBeVisible();
    const state = await (await member.request.get("/api/data")).json();
    expect(state.companies.length).toBeGreaterThan(0);
    expect(JSON.stringify(state.profiles)).not.toContain("password_hash");
    const denial = await member.request.post("/api/data", {
      headers: { Origin: "http://127.0.0.1:3000" },
      data: { action: "weights", data: state.weights },
    });
    expect(denial.ok()).toBe(false);
    const contact = await member.request.post("/api/data", {
      headers: { Origin: "http://127.0.0.1:3000" },
      data: {
        action: "contact",
        data: {
          company_id: state.companies[0].id,
          type: "Resposta",
          text: "Resposta registrada em teste compartilhado",
          result: "Interessado",
        },
      },
    });
    expect(contact.ok()).toBe(true);
    const after = await (await page.request.get("/api/data")).json();
    expect(
      after.contacts.some(
        (c: { text: string; user_name: string }) =>
          c.text === "Resposta registrada em teste compartilhado" &&
          c.user_name === "Laura teste",
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});

test("Google simulado: cidade sem segmento, fronteira 20 e ficha interna", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  await expect(
    page.getByRole("heading", { name: "Olá, equipe AXL" }),
  ).toBeVisible();
  const fixtures = [19, 20, 101].map((n, i) => ({
    id: "fixture-google-" + i,
    displayName: { text: "Fixture comércio " + n },
    formattedAddress: "Valinhos SP",
    rating: 4.8,
    userRatingCount: n,
    municipality: "matched",
    location: { latitude: -22.97, longitude: -46.99 },
    queried: [],
  }));
  let cityOnly = false;
  await page.route("**/api/places", async (route) => {
    const data = route.request().postDataJSON();
    if (data.mode === "detail")
      await route.fulfill({
        json: {
          place: {
            ...fixtures.find((p) => p.id === data.place_id),
            queried: ["phone", "website", "hours"],
          },
        },
      });
    else {
      expect(data.query).toBe("");
      expect(data.city).toBe("Valinhos");
      expect(data.minRating).toBeUndefined();
      cityOnly = true;
      await route.fulfill({
        json: { places: fixtures, synced_at: new Date().toISOString() },
      });
    }
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Prospecção", exact: true })
    .click();
  await page.getByRole("button", { name: "Buscar estabelecimentos" }).click();
  await expect(
    page.getByRole("button", { name: "Fixture comércio 20", exact: true }),
  ).toBeVisible();
  expect(cityOnly).toBe(true);
  await page.getByRole("button", { name: "Menos de 20", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Fixture comércio 19", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fixture comércio 20", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "20 ou mais", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Fixture comércio 20", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fixture comércio 19", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Fixture comércio 20", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Ficha da oportunidade" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Perfil Google / mapa" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Dashboard concilia filtros combinados, detalhes e preserva contexto ao voltar", async ({
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
  const baseCompany = { ...original.companies[0], is_customer: 1, is_lead: 0 };
  const companies = [
    {
      ...baseCompany,
      id: "c1",
      name: "Fixture Beleza Valinhos",
      city: "Valinhos",
      segment: "Beleza",
      salesperson_id: "owner",
    },
    {
      ...baseCompany,
      id: "c2",
      name: "Fixture Café Campinas",
      city: "Campinas",
      segment: "Café",
      salesperson_id: "owner",
    },
    {
      ...baseCompany,
      id: "c3",
      name: "Fixture Beleza Campinas",
      city: "Campinas",
      segment: "Beleza",
      salesperson_id: null,
    },
  ];
  const sales = companies.map((c, i) => ({
    ...original.sales[0],
    id: "s" + i,
    number: i + 1,
    company_id: c.id,
    company_name: c.name,
    date: "2026-10-06",
    date_start: "2026-10-06",
    date_end: "2026-10-06",
    total: (i + 1) * 10000,
    cost: 1000,
    profit: (i + 1) * 10000 - 1000,
    paid: 0,
    cost_known: 1,
    payment_known: 1,
    import_source: null,
  }));
  await page.route("**/api/data", (route) =>
    route.fulfill({
      json: {
        ...original,
        companies,
        sales,
        salespeople: [{ id: "owner", name: "Laura fixture" }],
        saleItems: [],
      },
    }),
  );
  await page
    .getByRole("button", { name: "Atualizar dados", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Dashboard", exact: true })
    .click();
  await page
    .getByLabel("Período", { exact: true })
    .selectOption("Todo o histórico");
  await page
    .getByRole("combobox", { name: "Cidade", exact: true })
    .selectOption("Valinhos");
  await page
    .getByRole("combobox", { name: "Segmento", exact: true })
    .selectOption("Beleza");
  await page
    .getByRole("combobox", { name: "Responsável", exact: true })
    .selectOption("owner");
  const card = page
    .locator(".metric")
    .filter({ has: page.getByText("Faturamento", { exact: true }) });
  await expect(card).toContainText("R$ 100,00");
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Valinhos");
  await expect(
    dialog.getByRole("button", {
      name: "Fixture Beleza Valinhos",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Fixture Café Campinas", { exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Clientes", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Dashboard", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Cidade", exact: true }),
  ).toHaveValue("Valinhos");
  await expect(card).toContainText("R$ 100,00");
});
