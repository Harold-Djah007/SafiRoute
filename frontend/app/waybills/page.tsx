"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell, StatusPill, formatWhen } from "@/components/AppShell";
import { api, type WaybillList } from "@/lib/api";

const STATUSES = ["", "draft", "completed", "voided"];

function WaybillListInner() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<WaybillList[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initial = searchParams.get("status") || "";
    setStatus(initial);
  }, [searchParams]);

  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("search", q);
      if (status) params.set("status", status);
      setLoading(true);
      api<{ results: WaybillList[] }>(`/waybills/?${params}`)
        .then((data) => setRows(data.results || []))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [q, status]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-gold-600">Documents</p>
          <h1 className="font-display text-4xl text-forest-800">Waybills</h1>
        </div>
        <Link href="/field/new" className="tap rounded-xl bg-gold-500 px-4 py-3 text-sm font-semibold text-forest-950">
          New waybill
        </Link>
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          placeholder="Search number, customer, phone or Sales name…"
          className="tap w-full max-w-md rounded-xl border border-forest-800/15 bg-white px-3 py-3"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="tap rounded-xl border border-forest-800/15 bg-white px-3 py-3"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s || "all"} value={s}>
              {s ? s.replaceAll("_", " ") : "All statuses"}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-rose-700">{error}</p>}
      {loading && <p className="text-sm text-ink/50">Loading…</p>}
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
                {row.customer_name}
                {row.contact_phone ? ` · ${row.contact_phone}` : ""} · {row.item_count} line
                {row.item_count === 1 ? "" : "s"}
              </p>
              {row.delivery_address_text && <p className="text-xs text-ink/50">{row.delivery_address_text}</p>}
            </div>
            <div className="text-right">
              <StatusPill status={row.status} label={row.status_display} />
              <p className="mt-1 text-xs text-ink/50">{formatWhen(row.created_at)}</p>
            </div>
          </Link>
        ))}
      </div>
      {!loading && !rows.length && (
        <div className="mt-6 rounded-3xl border border-dashed border-forest-800/20 p-8 text-center">
          <p className="font-display text-2xl text-forest-800">No waybills match</p>
          <p className="mt-2 text-sm text-ink/70">Try another status, or create a new Safisana waybill.</p>
        </div>
      )}
    </AppShell>
  );
}

export default function WaybillListPage() {
  return (
    <Suspense fallback={<AppShell><p>Loading waybills…</p></AppShell>}>
      <WaybillListInner />
    </Suspense>
  );
}
