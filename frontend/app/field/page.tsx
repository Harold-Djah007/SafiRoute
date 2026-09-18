"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WaybillJourney } from "@/components/WaybillJourney";
import {
  flushSalesWaybills,
  listSalesWaybills,
  type SalesWaybill,
} from "@/lib/sales-mobile";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function syncLabel(item: SalesWaybill) {
  if (item.syncStatus === "synced") return item.serverNumber ? `On HQ · ${item.serverNumber}` : "On HQ";
  if (item.syncStatus === "syncing") return "Sending to HQ…";
  if (item.syncStatus === "failed") return "Waiting for HQ";
  if (item.status === "completed") return "Waiting for HQ";
  return "Saved on phone";
}

export default function FieldHomePage() {
  const [items, setItems] = useState<SalesWaybill[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "draft" | "completed" | "pending">("all");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function refresh() {
    setItems(await listSalesWaybills());
  }

  useEffect(() => {
    void refresh();
    const saved = () => void refresh();
    window.addEventListener("safiroute:saved", saved);
    return () => window.removeEventListener("safiroute:saved", saved);
  }, []);

  const summary = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === "draft") acc.drafts += 1;
        if (item.status === "completed") acc.completed += 1;
        if (item.status === "completed" && item.syncStatus !== "synced") acc.pending += 1;
        return acc;
      },
      { total: 0, drafts: 0, completed: 0, pending: 0 }
    );
  }, [items]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "draft" && item.status !== "draft") return false;
      if (filter === "completed" && item.status !== "completed") return false;
      if (filter === "pending" && !(item.status === "completed" && item.syncStatus !== "synced")) return false;
      if (!needle) return true;
      return [item.localNumber, item.serverNumber, item.deliverTo, item.contactName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [items, filter, query]);

  async function syncNow() {
    setBusy(true);
    setNote("");
    const result = await flushSalesWaybills();
    await refresh();
    if (result.sent) setNote(`${result.sent} completed waybill${result.sent === 1 ? "" : "s"} sent to HQ.`);
    else if (result.failed) setNote("HQ is not reachable yet. Your completed waybills are still safe on this phone.");
    else setNote("Everything is already up to date.");
    setBusy(false);
  }

  return (
    <div className="sales-home">
      <section className="sales-home-intro">
        <p className="sales-eyebrow">SAFISANA GHANA · SALES</p>
        <h1>{greeting()}</h1>
        <p className="sales-home-lede">
          Create the same waybill your team knows from the paper pad — only faster, signed, geo-stamped and safe offline.
        </p>
      </section>

      <WaybillJourney />

      <Link href="/field/new" className="sales-new-waybill-cta">
        <span className="sales-new-waybill-icon" aria-hidden="true">＋</span>
        <span>
          <strong>New waybill</strong>
          <small>Start a customer delivery</small>
        </span>
        <b aria-hidden="true">›</b>
      </Link>

      <section className="sales-summary-grid" aria-label="Waybill summary">
        <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
          <strong>{summary.total}</strong><span>Total</span>
        </button>
        <button type="button" className={filter === "draft" ? "active" : ""} onClick={() => setFilter("draft")}>
          <strong>{summary.drafts}</strong><span>Drafts</span>
        </button>
        <button type="button" className={filter === "completed" ? "active" : ""} onClick={() => setFilter("completed")}>
          <strong>{summary.completed}</strong><span>Completed</span>
        </button>
        <button type="button" className={filter === "pending" ? "active" : ""} onClick={() => setFilter("pending")}>
          <strong>{summary.pending}</strong><span>Waiting HQ</span>
        </button>
      </section>

      {summary.pending > 0 && (
        <section className="sales-sync-card">
          <div>
            <p className="sales-eyebrow">SYNC</p>
            <h2>{summary.pending} waiting for HQ</h2>
            <p>They are already safe on this phone. Send them now if you have signal.</p>
          </div>
          <button type="button" onClick={syncNow} disabled={busy}>
            {busy ? "Sending…" : "Send now"}
          </button>
        </section>
      )}
      {note && <p className="sales-home-note">{note}</p>}

      <section className="sales-waybill-section">
        <div className="sales-section-heading">
          <div>
            <p className="sales-eyebrow">ON THIS PHONE</p>
            <h2>Saved waybills</h2>
          </div>
          <span>{visible.length}</span>
        </div>
        <label className="sales-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Search customer or waybill"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="sales-filter-chips" role="group" aria-label="Filter waybills">
          {(["all", "draft", "completed", "pending"] as const).map((value) => (
            <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
              {value === "all" ? "All" : value === "draft" ? "Drafts" : value === "completed" ? "Completed" : "Waiting HQ"}
            </button>
          ))}
        </div>

        <div className="sales-waybill-list">
          {visible.map((item) => (
            <Link key={item.id} href={`/field/waybill/${item.id}`} className="sales-waybill-card">
              <div className="sales-waybill-card-top">
                <span className={`sales-waybill-state ${item.status === "completed" ? "is-complete" : "is-draft"}`}>
                  {item.status === "completed" ? "✓ Completed" : "Draft"}
                </span>
                <span className={`sales-waybill-sync is-${item.syncStatus}`}>{syncLabel(item)}</span>
              </div>
              <h3>{item.deliverTo || "Customer not entered"}</h3>
              <p>{item.serverNumber || item.localNumber}</p>
              <div className="sales-waybill-meta">
                <span>{new Date(item.updatedAt).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })}</span>
                <b aria-hidden="true">›</b>
              </div>
            </Link>
          ))}
          {!visible.length && (
            <div className="sales-empty-state">
              <div className="sales-empty-paper" aria-hidden="true"><span>✓</span></div>
              <h3>{items.length ? "Nothing in this view" : "Your digital pad is ready"}</h3>
              <p>{items.length ? "Try another filter or search." : "Tap New waybill when the next customer is ready."}</p>
              {!items.length && <Link href="/field/new">Create first waybill</Link>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
