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
  deliver_to?: string;
  delivery_contact_name?: string;
  delivery_address_text?: string;
  contact_phone?: string;
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
  deliver_to: string;
  delivery_contact_name: string;
  delivery_address_text: string;
  contact_phone: string;
  document_date: string | null;
  authorised_by_name: string;
  authorised_remarks: string;
  dispatched_by_name: string;
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
  document_fingerprint?: string;
  pdf_sha256?: string;
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

const USER_KEY = "safiroute_user";

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return "";
}

async function csrfToken() {
  const fromCookie = readCookie("csrftoken");
  if (fromCookie) return fromCookie;
  const res = await fetch(`${API_URL}/auth/csrf/`, { credentials: "include", cache: "no-store" });
  if (!res.ok) return "";
  const data = (await res.json()) as { csrfToken?: string };
  return data.csrfToken || readCookie("csrftoken");
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

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const isForm = options.body instanceof FormData;
  if (!isForm && !headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const method = (options.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !headers.has("X-CSRFToken")) {
    const csrf = await csrfToken();
    if (csrf) headers.set("X-CSRFToken", csrf);
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });
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
  return api<{ ok: boolean; session: boolean; user: User }>("/auth/login/", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function saveSession(user: User) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.removeItem("safiroute_token");
  localStorage.removeItem("safiroute_user");
}

export async function logoutRequest() {
  try {
    await api("/auth/logout/", { method: "POST" });
  } catch {
    /* session may already be gone */
  }
  clearSession();
}

export function clearSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem("safiroute_token");
  localStorage.removeItem("safiroute_user");
}

export function readUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as User) : null;
}

export async function bootstrapSession(): Promise<User | null> {
  try {
    const user = await api<User>("/me/");
    saveSession(user);
    return user;
  } catch {
    const cached = readUser();
    if (cached && typeof navigator !== "undefined" && navigator.onLine === false) {
      return cached;
    }
    clearSession();
    return null;
  }
}
