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
