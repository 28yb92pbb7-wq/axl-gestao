import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { insert, one, run, transaction } from "./db";
import { hashPassword } from "./auth";
import { today } from "./domain";
function seed() {
  if (one("SELECT id FROM profiles LIMIT 1")) {
    console.log("Banco já inicializado. Dados existentes preservados.");
    return;
  }
  const email = process.env.AXL_ADMIN_EMAIL || "admin@axl.local";
  const password =
    process.env.AXL_ADMIN_PASSWORD || randomBytes(12).toString("base64url");
  if (password.length < 12)
    throw new Error("Use ao menos 12 caracteres na senha inicial.");
  transaction(() => {
    const admin = insert("profiles", {
      email,
      name: "Administrador AXL",
      password_hash: hashPassword(password),
      role: "ADMIN",
    });
    const seller = insert("salespeople", {
      name: "Equipe AXL",
      email,
      city: "Valinhos",
      commission_value: 5,
    });
    const materials = [
      ["Acrílico 10x10", 270, 60],
      ["Tag NFC", 79, 18],
      ["Adesivo", 83, 80],
      ["Embalagem", 30, 100],
      ["Cartão metálico", 1200, 20],
    ] as const;
    const inventory = materials.map(([name, cost, quantity]) =>
      insert("inventory_items", {
        name,
        cost,
        quantity,
        minimum: 20,
        unit: "un",
      }),
    );
    const products = [
      ["Placa Google NFC 10x10", "AXL-GOO", "Placas NFC", 6000, 462, true],
      ["Placa WhatsApp NFC 10x10", "AXL-WPP", "Placas NFC", 6000, 462, true],
      ["Placa Instagram NFC 10x10", "AXL-INS", "Placas NFC", 6000, 462, true],
      ["Placa Pix QR 10x10", "AXL-PIX", "Placas QR", 3500, 383, true],
      ["Placa Cardápio NFC", "AXL-MENU", "Placas NFC", 6500, 462, true],
      ["Adesivo NFC 5x5", "AXL-ADES", "Adesivos NFC", 2000, 162, false],
      ["Cartão metálico NFC", "AXL-CARD", "Cartões NFC", 9000, 1279, false],
      ["Biosite", "AXL-BIO", "Serviços digitais", 15000, 0, false],
      ["Google Perfil", "AXL-PERFIL", "Serviços digitais", 25000, 0, false],
      ["Gestão Digital", "AXL-DIG", "Serviços digitais", 35000, 0, false],
      ["Consultoria", "AXL-CONS", "Consultoria", 18000, 0, false],
    ] as const;
    products.forEach(([name, sku, category, price, cost, plate], index) => {
      const id = insert("products", {
        name,
        sku,
        category,
        price,
        cost,
        is_plate: Number(plate),
        uses_nfc: Number(category.includes("NFC")),
        uses_acrylic: Number(plate),
        controls_stock: Number(index < 7),
      });
      const components =
        index < 5
          ? index === 3
            ? [0, 2, 3]
            : [0, 1, 2, 3]
          : index === 5
            ? [1, 2]
            : index === 6
              ? [4, 1]
              : [];
      components.forEach((i) =>
        insert("product_components", {
          product_id: id,
          inventory_id: inventory[i],
          quantity: 1,
        }),
      );
    });
    insert("goals", { period: "Diária", amount: 100000 });
    insert("goals", { period: "Semanal", amount: 500000 });
    insert("goals", { period: "Mensal", amount: 2200000 });
    run(
      "INSERT INTO settings(key,value) VALUES(?,?)",
      "score_weights",
      JSON.stringify({
        rating: 25,
        reviews: 25,
        phone: 10,
        website: 10,
        segment: 15,
        contact: 10,
        other: 5,
      }),
    );
    if (process.env.AXL_DEMO_SEED !== "false") {
      const companies = [
        ["Restaurante Cartola", "Restaurante", "Valinhos", "Negociação", 1],
        ["Pet Vida", "Pet shop", "Vinhedo", "Interessado", 0],
        ["Barbearia Alameda", "Barbearia", "Valinhos", "Novo lead", 0],
        ["Café da Praça", "Restaurante", "Campinas", "Proposta enviada", 0],
        ["Clínica Essência", "Clínica", "Louveira", "Contato realizado", 0],
        ["Mercado Primavera", "Mercado", "Itatiba", "Venda", 1],
      ] as const;
      companies.forEach(([name, segment, city, status, customer]) => {
        const id = insert("companies", {
          name,
          segment,
          city,
          status,
          is_customer: customer,
          origin: "Demonstração",
          salesperson_id: seller,
          notes:
            "Registro fictício para testar o sistema. Edite ou substitua por um cadastro real.",
        });
        insert("activities", {
          company_id: id,
          user_id: admin,
          type: "Cadastro",
          description: "Cadastro demonstrativo criado.",
        });
        if (!customer)
          insert("followups", {
            company_id: id,
            date: today() + "T14:00",
            reason: "Apresentar as soluções AXL",
            responsible: "Equipe AXL",
          });
      });
    }
  });
  if (!process.env.AXL_ADMIN_PASSWORD) {
    const file = ".data/acesso-inicial.txt";
    if (!existsSync(file))
      writeFileSync(
        file,
        `Acesso local inicial\nE-mail: ${email}\nSenha: ${password}\nNão publique ou compartilhe este arquivo.\n`,
        { mode: 0o600 },
      );
    console.log(
      "Administrador criado. Acesso inicial salvo no arquivo ignorado .data/acesso-inicial.txt (não exibido nos logs).",
    );
  } else console.log("Administrador criado com a senha fornecida no ambiente.");
}
seed();
