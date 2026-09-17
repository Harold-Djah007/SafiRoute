"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { logoutRequest, readUser, type User } from "@/lib/api";
import {
  flushSalesWaybills,
  getSalesMobileSettings,
  hashPin,
  listSalesWaybills,
  type SalesMobileSettings,
} from "@/lib/sales-mobile";

const LOCK_KEY = "safiroute_sales_pad_locked";

export function FieldShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<SalesMobileSettings | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncNote, setSyncNote] = useState("");
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  async function refreshStatus() {
    try {
      const [profile, waybills] = await Promise.all([getSalesMobileSettings(), listSalesWaybills()]);
      setSettings(profile);
      setPending(waybills.filter((item) => item.status === "completed" && item.syncStatus !== "synced").length);
      const shouldLock = Boolean(profile.pinHash && localStorage.getItem(LOCK_KEY) === "1");
      setLocked(shouldLock);
      if (!profile.pinHash && localStorage.getItem(LOCK_KEY) === "1") localStorage.removeItem(LOCK_KEY);
    } catch {
      setPending(0);
    }
  }

  useEffect(() => {
    const current = readUser();
    if (!current) {
      router.replace("/");
      return;
    }
    if (current.role !== "sales") {
      router.replace("/dashboard");
      return;
    }
    setUser(current);
    setOnline(navigator.onLine);
    void refreshStatus();

    const onOnline = () => {
      setOnline(true);
      void flushSalesWaybills().then((result) => {
        if (result.sent) setSyncNote(`${result.sent} waybill${result.sent === 1 ? "" : "s"} sent to HQ`);
        void refreshStatus();
      });
    };
    const onOffline = () => setOnline(false);
    const onSaved = () => void refreshStatus();
    const onLock = () => {
      localStorage.setItem(LOCK_KEY, "1");
      setLocked(true);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("safiroute:saved", onSaved);
    window.addEventListener("safiroute:lock", onLock);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("safiroute:saved", onSaved);
      window.removeEventListener("safiroute:lock", onLock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!online || locked) return;
    void flushSalesWaybills().then((result) => {
      if (result.sent) setSyncNote(`${result.sent} waybill${result.sent === 1 ? "" : "s"} sent to HQ`);
      void refreshStatus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, pathname, locked]);

  const title = useMemo(() => {
    if (pathname === "/field/settings") return "Settings";
    if (pathname === "/field/new") return "New waybill";
    if (pathname.startsWith("/field/waybill/")) return "Waybill";
    return "Sales waybills";
  }, [pathname]);

  if (!user) {
    return <div className="grid min-h-dvh place-items-center bg-[#f4efe2] text-forest-800">Opening SafiRoute…</div>;
  }

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setPinError("");
    if (!settings?.pinHash) {
      localStorage.removeItem(LOCK_KEY);
      setLocked(false);
      return;
    }
    if ((await hashPin(pin.trim())) !== settings.pinHash) {
      setPinError("That PIN does not match.");
      return;
    }
    localStorage.removeItem(LOCK_KEY);
    setPin("");
    setLocked(false);
  }

  return (
    <div className="sales-mobile-shell min-h-dvh text-ink">
      <header className="sales-mobile-topbar">
        <Link href="/field" className="sales-mobile-brand" aria-label="SafiRoute sales waybills">
          <img src="/safiroute-icon.png" alt="" />
          <span>
            <strong>SafiRoute</strong>
            <em>{title}</em>
          </span>
        </Link>
        <div className="sales-mobile-status">
          <strong>{user.first_name || user.username}</strong>
          <span className={online ? "is-online" : "is-offline"}>
            <i /> {online ? "Online" : "Offline"}{pending ? ` · ${pending} waiting` : ""}
          </span>
        </div>
      </header>

      {!online && (
        <div className="sales-offline-banner">
          No signal — keep working. SafiRoute is saving this waybill on the phone.
        </div>
      )}
      {online && syncNote && <div className="sales-sync-banner">✓ {syncNote}</div>}

      <main className="sales-mobile-main">{children}</main>

      <nav className="sales-mobile-nav" aria-label="Sales mobile navigation">
        <Link href="/field" className={pathname === "/field" ? "active" : ""}>
          <span aria-hidden="true">▤</span>
          <small>Waybills</small>
        </Link>
        <Link href="/field/new" className={`sales-nav-new ${pathname === "/field/new" ? "active" : ""}`}>
          <span aria-hidden="true">＋</span>
          <small>New</small>
        </Link>
        <Link href="/field/settings" className={pathname === "/field/settings" ? "active" : ""}>
          <span aria-hidden="true">⚙</span>
          <small>Settings</small>
        </Link>
        <button
          type="button"
          onClick={() => {
            void logoutRequest().then(() => router.replace("/"));
          }}
        >
          <span aria-hidden="true">↪</span>
          <small>Sign out</small>
        </button>
      </nav>

      {locked && (
        <div className="sales-lock-screen" role="dialog" aria-modal="true" aria-labelledby="sales-lock-title">
          <form onSubmit={unlock} className="sales-lock-card">
            <img src="/safiroute-icon.png" alt="" />
            <p className="sales-eyebrow">THIS PHONE</p>
            <h1 id="sales-lock-title">SafiRoute is locked</h1>
            <p>{user.full_name}</p>
            <label>
              4-digit PIN
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </label>
            {pinError && <div className="sales-error">{pinError}</div>}
            <button type="submit" className="sales-primary-button">Unlock pad</button>
          </form>
        </div>
      )}
    </div>
  );
}
