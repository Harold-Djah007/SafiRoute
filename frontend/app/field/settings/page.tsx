"use client";

import { useEffect, useMemo, useState } from "react";
import { SignaturePad } from "@/components/SignaturePad";
import { readUser } from "@/lib/api";
import {
  buildSalesBackup,
  flushSalesWaybills,
  getSalesMobileSettings,
  hashPin,
  listSalesWaybills,
  restoreSalesBackup,
  saveSalesMobileSettings,
  type SalesMobileSettings,
} from "@/lib/sales-mobile";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function SalesMobileSettingsPage() {
  const user = readUser();
  const [settings, setSettings] = useState<SalesMobileSettings | null>(null);
  const [pending, setPending] = useState(0);
  const [total, setTotal] = useState(0);
  const [notice, setNotice] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [restoring, setRestoring] = useState(false);

  async function refresh() {
    const [profile, waybills] = await Promise.all([getSalesMobileSettings(), listSalesWaybills()]);
    setSettings(profile);
    setTotal(waybills.length);
    setPending(waybills.filter((item) => item.status === "completed" && item.syncStatus !== "synced").length);
  }

  useEffect(() => {
    void refresh();
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", beforeInstall);
  }, []);

  const initials = useMemo(() => {
    return (user?.full_name || "S")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }, [user]);

  async function saveProfile() {
    if (!settings) return;
    const saved = await saveSalesMobileSettings(settings);
    setSettings(saved);
    setNotice("Sales details saved on this phone.");
  }

  async function savePin() {
    if (!settings) return;
    if (!/^\d{4}$/.test(pin)) {
      setNotice("Use exactly 4 digits for the phone PIN.");
      return;
    }
    if (pin !== confirmPin) {
      setNotice("Those PINs do not match.");
      return;
    }
    const saved = await saveSalesMobileSettings({ ...settings, pinHash: await hashPin(pin) });
    setSettings(saved);
    setPin("");
    setConfirmPin("");
    setNotice("Phone lock PIN saved.");
  }

  async function removePin() {
    if (!settings) return;
    const saved = await saveSalesMobileSettings({ ...settings, pinHash: null });
    setSettings(saved);
    localStorage.removeItem("safiroute_sales_pad_locked");
    setNotice("Phone lock removed.");
  }

  async function exportBackup() {
    if (!settings) return;
    const waybills = await listSalesWaybills();
    const exportedAt = new Date().toISOString();
    const payload = buildSalesBackup(settings, waybills);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `safiroute-sales-backup-${exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    const saved = await saveSalesMobileSettings({ ...settings, lastBackupAt: exportedAt });
    setSettings(saved);
    setNotice("Backup exported. Keep a copy away from this phone.");
  }

  async function restoreBackup(file: File) {
    setRestoring(true);
    setNotice("Checking backup…");
    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const result = await restoreSalesBackup(payload);
      setSettings(result.settings);
      await refresh();
      window.dispatchEvent(new Event("safiroute:saved"));
      setNotice(`${result.restored} waybill${result.restored === 1 ? "" : "s"} restored safely to this phone.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not restore that SafiRoute backup.");
    } finally {
      setRestoring(false);
    }
  }

  async function syncNow() {
    setNotice("Sending completed waybills…");
    const result = await flushSalesWaybills();
    await refresh();
    setNotice(
      result.sent
        ? `${result.sent} waybill${result.sent === 1 ? "" : "s"} accepted by HQ.`
        : result.failed
          ? "HQ is not reachable yet. Nothing was lost; the waybills remain on this phone."
          : "Everything is already up to date."
    );
  }

  if (!settings) return <div className="sales-loading-card">Opening Settings…</div>;

  return (
    <div className="sales-settings-page">
      <header className="sales-settings-head">
        <p className="sales-eyebrow">THIS PHONE</p>
        <h1>Settings</h1>
        <p>Simple controls for the SafiRoute sales pad.</p>
      </header>

      <section className="sales-settings-group sales-settings-identity">
        <div className="sales-settings-row">
          <span className="sales-settings-avatar">{initials}</span>
          <span className="sales-settings-copy"><b>{user?.full_name || "Sales officer"}</b><small>Sales account · {user?.branch || "Safisana Ghana"}</small></span>
          <span className="sales-settings-value">{total} waybills</span>
        </div>
      </section>

      <h2 className="sales-settings-section-title">Sales on this phone</h2>
      <section className="sales-settings-group">
        <details className="sales-settings-details">
          <summary className="sales-settings-row">
            <span className="sales-settings-icon forest">☎</span>
            <span className="sales-settings-copy"><b>Phone</b><small>Optional contact number</small></span>
            <span className="sales-settings-value">{settings.phone || "Not set"}</span><i>›</i>
          </summary>
          <div className="sales-settings-editor">
            <label>Phone number<input inputMode="tel" value={settings.phone} onChange={(event) => setSettings({ ...settings, phone: event.target.value })} placeholder="024…" /></label>
          </div>
        </details>
        <details className="sales-settings-details">
          <summary className="sales-settings-row">
            <span className="sales-settings-icon lime">▣</span>
            <span className="sales-settings-copy"><b>Usual vehicle</b><small>Pre-fills new waybills</small></span>
            <span className="sales-settings-value">{settings.vehicleNumber || "Not set"}</span><i>›</i>
          </summary>
          <div className="sales-settings-editor">
            <label>Vehicle registration<input value={settings.vehicleNumber} onChange={(event) => setSettings({ ...settings, vehicleNumber: event.target.value.toUpperCase() })} placeholder="GT 0000-00" /></label>
          </div>
        </details>
        <details className="sales-settings-details">
          <summary className="sales-settings-row">
            <span className="sales-settings-icon gold">✎</span>
            <span className="sales-settings-copy"><b>Sales signature</b><small>Pre-fills Authorised by</small></span>
            <span className="sales-settings-value">{settings.authorisedSignature ? "Saved" : "Not saved"}</span><i>›</i>
          </summary>
          <div className="sales-settings-editor signature-editor">
            <SignaturePad label="Authorised-by signature" value={settings.authorisedSignature} onChange={(value) => setSettings({ ...settings, authorisedSignature: value })} />
          </div>
        </details>
        <div className="sales-settings-commit">
          <span><b>Sales details</b><small>Stored on this phone</small></span>
          <button type="button" onClick={saveProfile}>Save</button>
        </div>
      </section>

      <h2 className="sales-settings-section-title">Phone lock</h2>
      <section className="sales-settings-group">
        <div className="sales-settings-row">
          <span className="sales-settings-icon gold">▣</span>
          <span className="sales-settings-copy"><b>PIN</b><small>Optional 4-digit phone lock</small></span>
          <span className={`sales-settings-value ${settings.pinHash ? "is-on" : ""}`}>{settings.pinHash ? "On" : "Off"}</span>
        </div>
        <details className="sales-settings-details">
          <summary className="sales-settings-row">
            <span className="sales-settings-icon forest">••</span>
            <span className="sales-settings-copy"><b>{settings.pinHash ? "Change PIN" : "Set PIN"}</b><small>Only locks this SafiRoute pad</small></span>
            <i>›</i>
          </summary>
          <div className="sales-settings-editor two-fields">
            <label>New 4-digit PIN<input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
            <label>Confirm PIN<input type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
            <button type="button" className="sales-settings-action" onClick={savePin}>Save PIN</button>
          </div>
        </details>
        {settings.pinHash && (
          <>
            <button type="button" className="sales-settings-row settings-button" onClick={() => window.dispatchEvent(new Event("safiroute:lock"))}>
              <span className="sales-settings-icon lime">⌾</span>
              <span className="sales-settings-copy"><b>Lock pad now</b><small>Require the PIN to reopen</small></span><i>›</i>
            </button>
            <button type="button" className="sales-settings-row settings-button danger" onClick={removePin}>
              <span className="sales-settings-icon muted">×</span>
              <span className="sales-settings-copy"><b>Remove PIN</b><small>Stop locking this pad</small></span>
            </button>
          </>
        )}
      </section>

      <h2 className="sales-settings-section-title">Data & recovery</h2>
      <section className="sales-settings-group">
        <button type="button" className="sales-settings-row settings-button" onClick={exportBackup}>
          <span className="sales-settings-icon forest">↑</span>
          <span className="sales-settings-copy"><b>Export backup</b><small>{settings.lastBackupAt ? `Last: ${new Date(settings.lastBackupAt).toLocaleDateString("en-GH")}` : "Keep a copy off this phone"}</small></span><i>›</i>
        </button>
        <label className={`sales-settings-row settings-button ${restoring ? "is-disabled" : ""}`}>
          <span className="sales-settings-icon gold">↓</span>
          <span className="sales-settings-copy"><b>{restoring ? "Restoring…" : "Restore backup"}</b><small>Bring saved waybills back to this phone</small></span><i>›</i>
          <input
            type="file"
            accept="application/json,.json"
            hidden
            disabled={restoring}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void restoreBackup(file);
            }}
          />
        </label>
      </section>

      <h2 className="sales-settings-section-title">HQ sync</h2>
      <section className="sales-settings-group">
        <div className="sales-settings-row">
          <span className="sales-settings-icon lime">↻</span>
          <span className="sales-settings-copy"><b>Completed waybills</b><small>Only marked On HQ after server acceptance</small></span>
          <span className="sales-settings-value">{pending ? `${pending} waiting` : "Up to date"}</span>
        </div>
        <button type="button" className="sales-settings-row settings-button" onClick={syncNow}>
          <span className="sales-settings-icon forest">⇧</span>
          <span className="sales-settings-copy"><b>Send pending now</b><small>Safe to retry — client UUID prevents duplicates</small></span><i>›</i>
        </button>
      </section>

      <h2 className="sales-settings-section-title">App</h2>
      <section className="sales-settings-group">
        {installPrompt && (
          <button
            type="button"
            className="sales-settings-row settings-button"
            onClick={async () => {
              await installPrompt.prompt();
              await installPrompt.userChoice;
              setInstallPrompt(null);
            }}
          >
            <span className="sales-settings-icon gold">↓</span>
            <span className="sales-settings-copy"><b>Install SafiRoute</b><small>Put the Sales pad on your home screen</small></span><i>›</i>
          </button>
        )}
        <div className="sales-settings-row">
          <span className="sales-settings-icon gold">⌂</span>
          <span className="sales-settings-copy"><b>Add to Home Screen</b><small>Chrome: menu → Add to Home screen · iPhone: Share → Add to Home Screen</small></span>
        </div>
        <div className="sales-settings-row">
          <span className="sales-settings-icon muted">i</span>
          <span className="sales-settings-copy"><b>SafiRoute Sales</b><small>Every delivery. Verified.</small></span>
          <span className="sales-settings-value">mobile v2</span>
        </div>
      </section>

      {notice && <div className="sales-settings-notice" role="status">{notice}</div>}
    </div>
  );
}
