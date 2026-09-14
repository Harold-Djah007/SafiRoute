"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, StatusPill, formatWhen } from "@/components/AppShell";
import { api, type WaybillList } from "@/lib/api";

export default function WaybillListPage() {
  const [rows, setRows] = useState<WaybillList[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (status) params.set("status", status);
    api<{ results: WaybillList[] }>(`/waybills/?${params}`)
      .then((data) => setRows(data.results || []))
      .catch((err) => setError(err.message));
  }, [q, status]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-gold-600">Documents</p>
          <h1 className="font-display text-4xl text-forest-800">Waybills</h1>
        </div>
        <Link href="/waybills/new" className="rounded-xl bg-gold-500 px-4 py-2 text-sm font-semibold text-forest-950">
          Create draft
        </Link>
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          placeholder="Search number, customer, invoice…"
          className="w-full max-w-md rounded-xl border border-forest-800/15 bg-white px-3 py-2"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="rounded-xl border border-forest-800/15 bg-white px-3 py-2"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {[
            "draft",
            "pending_approval",
            "approved",
            "loaded",
            "dispatched",
            "in_transit",
            "delivered",
            "partially_delivered",
            "delivery_failed",
            "cancelled",
          ].map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-rose-700">{error}</p>}
      <div className="grid gap-3">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/waybills/${row.id}`}
            className="ticket flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper p-4"
          >
            <div>
              <p className="font-display text-xl text-forest-800">{row.waybill_number}</p>
              <p className="text-sm text-ink/70">
                {row.customer_name} · {row.item_count} line{row.item_count === 1 ? "" : "s"}
              </p>
            </div>
            <div className="text-right">
              <StatusPill status={row.status} label={row.status_display} />
              <p className="mt-1 text-xs text-ink/50">{formatWhen(row.created_at)}</p>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
