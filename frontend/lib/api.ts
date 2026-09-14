export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
export const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN || "http://127.0.0.1:8877";

export type Role =
  | "admin"
  | "sales"
  | "supervisor"
  | "warehouse"
  | "driver"
  | "finance";

export type User = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  role: Role;
  role_display: string;
  phone: string;
  employee_id: string;
  branch: string;
};

export type WaybillList = {
  id: number;
  waybill_number: string;
  status: string;
  status_display: string;
  sync_status: string;
  customer: number;
  customer_name: string;
  driver: number | null;
  driver_name: string;
  branch: string;
  sales_order_ref: string;
  item_count: number;
  created_at: string;
  dispatch_at: string | null;
  delivery_at: string | null;
  updated_at: string;
};

export type WaybillItem = {
  id: number;
  product: number;
  product_name: string;
  sku: string;
  unit_of_measure: string;
  ordered_qty: string;
  loaded_qty: string | null;
  delivered_qty: string | null;
  rejected_qty: string;
  batch_number: string;
  notes: string;
};

export type Waybill = {
  id: number;
  waybill_number: string;
  verification_token: string;
  verification_url: string;
  status: string;
  status_display: string;
  sync_status: string;
  customer: number;
  customer_detail: {
    name: string;
    account_number: string;
    delivery_address: string;
    contact_name: string;
    phone: string;
    ghana_post_gps: string;
  };
  sales_order_ref: string;
  invoice_ref: string;
  po_ref: string;
  branch: string;
  created_by_detail?: User;
  driver: number | null;
  driver_detail: User | null;
  vehicle: number | null;
  vehicle_detail: { registration_number: string; transport_company: string } | null;
  driver_phone: string;
  dispatch_at: string | null;
  delivery_at: string | null;
  delivery_lat: string | null;
  delivery_lng: string | null;
  gps_unavailable_reason: string;
  customer_rep_name: string;
  customer_rep_role: string;
  customer_signature: string | null;
  driver_signature: string | null;
  delivery_notes: string;
  failure_reason: string;
  cancellation_reason: string;
  pdf_file: string | null;
  pdf_version: number;
  items: WaybillItem[];
  photos: { id: number; image: string; caption: string; captured_at: string }[];
  audit_logs: {
    id: number;
    action: string;
    from_status: string;
    to_status: string;
    actor_name: string;
    created_at: string;
    detail: Record<string, unknown>;
  }[];
  created_at: string;
};

function token() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("safiroute_token") || "";
}

export function mediaUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("http")) {
    try {
      const parsed = new URL(path);
      if (parsed.pathname.startsWith("/media/")) return parsed.pathname;
    } catch {
      return path;
    }
    return path;
  }
  return path.startsWith("/") ? path : `${API_ORIGIN}${path}`;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  const isForm = options.body instanceof FormData;
  if (!isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const t = token();
  if (t) headers.set("Authorization", `Token ${t}`);
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    const detail =
      (typeof data.detail === "string" && data.detail) ||
      `Could not reach the SafiRoute API (${res.status}). Start Django with: python manage.py runserver 127.0.0.1:8877`;
    throw new Error(detail);
  }
  return data as T;
}

export function loginRequest(username: string, password: string) {
  return api<{ token: string; user: User }>("/auth/login/", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function saveSession(tokenValue: string, user: User) {
  localStorage.setItem("safiroute_token", tokenValue);
  localStorage.setItem("safiroute_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("safiroute_token");
  localStorage.removeItem("safiroute_user");
}

export function readUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("safiroute_user");
  return raw ? (JSON.parse(raw) as User) : null;
}
