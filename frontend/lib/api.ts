export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
export const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN || "http://127.0.0.1:8877";

export type Role = "admin" | "sales";

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
  status: "draft" | "completed" | "voided";
  status_display: string;
  sync_status: string;
  customer: number;
  customer_name: string;
  deliver_to?: string;
  delivery_contact_name?: string;
  delivery_address_text?: string;
  contact_phone?: string;
  authorised_by_name?: string;
  dispatched_by_name?: string;
  created_by_name: string;
  item_count: number;
  created_at: string;
  delivery_at: string | null;
  updated_at: string;
};

export type WaybillItem = {
  id: number;
  product: number | null;
  product_name: string;
  notes: string;
};

export type Waybill = {
  id: number;
  waybill_number: string;
  verification_token: string;
  verification_url: string;
  status: "draft" | "completed" | "voided";
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
  deliver_to: string;
  delivery_contact_name: string;
  delivery_address_text: string;
  contact_phone: string;
  document_date: string | null;
  authorised_by_name: string;
  authorised_remarks: string;
  dispatched_by_name: string;
  created_by_detail?: User;
  delivery_at: string | null;
  delivery_device_at: string | null;
  delivery_lat: string | null;
  delivery_lng: string | null;
  delivery_gps_accuracy: number | null;
  gps_unavailable_reason: string;
  received_by: string;
  authorised_signature: string | null;
  dispatched_signature: string | null;
  customer_signature: string | null;
  delivery_notes: string;
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
  updated_at: string;
};

const USER_KEY = "safiroute_user";
const OFFLINE_USER_KEY = "safiroute_offline_sales_profile";

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
      `Could not reach the SafiRoute API (${res.status}). Start Django and try again.`;
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

function readOfflineUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(OFFLINE_USER_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as User;
    return user?.role === "sales" || user?.role === "admin" ? user : null;
  } catch {
    localStorage.removeItem(OFFLINE_USER_KEY);
    return null;
  }
}

export function saveSession(user: User) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  // This is profile data only, never a credential or API token. Keeping the
  // Sales identity lets an installed PWA reopen offline after the browser has
  // discarded sessionStorage. Server writes still require the HttpOnly Django
  // session once connectivity returns.
  if (user.role === "sales" || user.role === "admin") localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(OFFLINE_USER_KEY);
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
  localStorage.removeItem(OFFLINE_USER_KEY);
  localStorage.removeItem("safiroute_token");
  localStorage.removeItem("safiroute_user");
}

export function readUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as User;
    } catch {
      sessionStorage.removeItem(USER_KEY);
    }
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return readOfflineUser();
  return null;
}

export async function bootstrapSession(): Promise<User | null> {
  try {
    const user = await api<User>("/me/");
    saveSession(user);
    return user;
  } catch {
    // Keep the local-first shell usable when HQ is temporarily unreachable.
    // `readUser` uses sessionStorage while online and the non-secret persisted
    // Sales profile only when the browser reports that it is offline.
    const cached = readUser();
    if (cached) return cached;
    sessionStorage.removeItem(USER_KEY);
    return null;
  }
}
