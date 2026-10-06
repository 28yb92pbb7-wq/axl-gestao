export type Company = {
  id: string;
  name: string;
  legal_name: string;
  document: string;
  contact: string;
  phone: string;
  email: string;
  city: string;
  neighborhood: string;
  state: string;
  address: string;
  postal_code: string;
  segment: string;
  origin: string;
  notes: string;
  is_customer: number;
  is_lead: number;
  status: string;
  salesperson_id: string | null;
  place_id: string | null;
  created_at: string;
};
export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  description: string;
  price: number;
  cost: number;
  is_plate: number;
  active: number;
  uses_nfc: number;
  uses_acrylic: number;
  controls_stock: number;
  unit: string;
};
export type Sale = {
  id: string;
  number: number;
  company_id: string;
  company_name: string;
  salesperson_id: string | null;
  date: string;
  total: number;
  cost: number;
  profit: number;
  plates: number;
  paid: number;
  method: string;
  due_date: string;
  notes: string;
  commission: number;
  commission_rule: string;
};
export type Order = {
  id: string;
  sale_id: string;
  number: number;
  company_name: string;
  status: string;
  promised_date: string;
  notes: string;
  produced_at: string | null;
};
export type Inventory = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minimum: number;
  cost: number;
  supplier: string;
};
export type Activity = {
  id: string;
  company_id: string;
  type: string;
  description: string;
  created_at: string;
};
export type Followup = {
  id: string;
  company_id: string;
  company_name: string;
  date: string;
  reason: string;
  responsible: string;
  done: number;
};
export type Seller = {
  id: string;
  name: string;
  email: string;
  city: string;
  commission_type: string;
  commission_value: number;
};
export type Expense = {
  id: string;
  description: string;
  category: string;
  amount: number;
  date: string;
  paid: number;
};
export type Route = {
  id: string;
  name: string;
  date: string;
  salesperson_id: string | null;
};
export type Stop = {
  id: string;
  route_id: string;
  company_id: string;
  name: string;
  address: string;
  city: string;
  position: number;
  status: string;
};
export type State = {
  backend: "local" | "supabase";
  profiles: {
    id: string;
    name: string;
    email: string;
    role: string;
    created_at: string;
  }[];
  saleItems: {
    id: string;
    sale_id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    price: number;
    cost: number;
    is_plate: number;
    components_snapshot: string;
  }[];
  payments: {
    id: string;
    sale_id: string;
    amount: number;
    method: string;
    date: string;
  }[];
  companies: Company[];
  products: Product[];
  sales: Sale[];
  orders: Order[];
  inventory: Inventory[];
  activities: Activity[];
  followups: Followup[];
  salespeople: Seller[];
  expenses: Expense[];
  goals: { id: string; period: string; amount: number }[];
  components: {
    id: string;
    product_id: string;
    inventory_id: string;
    quantity: number;
  }[];
  movements: {
    id: string;
    name: string;
    quantity: number;
    type: string;
    description: string;
    created_at: string;
  }[];
  routes: Route[];
  stops: Stop[];
  audit: {
    id: string;
    name: string;
    action: string;
    entity_id: string;
    created_at: string;
  }[];
  weights: import("./domain").ScoreWeights;
};
