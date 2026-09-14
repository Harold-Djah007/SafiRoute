"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, StatusPill, formatWhen } from "@/components/AppShell";
import { api, readUser, type WaybillList } from "@/lib/api";

type Dash = {
  counts: Record<string, number>;
  today: { created: number; delivered: number; in_field: number };
  recent: WaybillList[];
  awaiting?: WaybillList[];
  in_field?: WaybillList[];
};

const PIPELINE: { key: string; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Approval" },
  { key: "approved", label: "Approved" },
  { key: "loaded", label: "Loaded" },
  { key: "dispatched", label: "Dispatched" },
  { key: "in_transit", label: "In transit" },
  { key: "delivered", label: "Delivered" },
];

export default function DashboardPage() {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    const user = readUser();
    if (user?.role === "driver") {
      window.location.replace("/field");
      return;
    }
    if (user) setName(user.full_name.split(" ")[0] || user.full_name);
    api<Dash>("/waybills/dashboard/")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const cards = [
    ["Today created", data?.today.created ?? "—", "/waybills"],
    ["In the field", data?.today.in_field ?? "—", "/waybills?status=in_transit"],
    ["Delivered today", data?.today.delivered ?? "—", "/waybills?status=delivered"],
    ["Awaiting approval", data?.counts.pending_approval ?? "—", "/waybills?status=pending_approval"],
  ] as const;

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-gold-600">Operations</p>
          <h1 className="font-display text-4xl text-forest-800">
            {name ? `${name}, here is Ashaiman today` : "Today at Ashaiman"}
          </h1>
        </div>
        <Link href="/waybills/new" className="tap rounded-xl bg-forest-800 px-4 py-3 text-sm font-semibold text-cream">
          New waybill
        </Link>
      </div>
      {error && <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-rose-800">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, href]) => (
          <Link key={label} href={href} className="ticket rounded-2xl bg-paper p-5 shadow-ticket">
            <p className="text-sm text-ink/60">{label}</p>
            <p className="mt-2 font-display text-4xl text-forest-800">{value}</p>
          </Link>
        ))}
      </div>
      <div className="mt-8 flex gap-2 overflow-x-auto pb-2">
        {PIPELINE.map((step) => (
          <Link
            key={step.key}
            href={`/waybills?status=${step.key}`}
            className="min-w-[7.5rem] rounded-2xl bg-paper px-3 py-3 text-center"
          >
            <p className="font-display text-2xl text-forest-800">{data?.counts[step.key] ?? "—"}</p>
            <p className="text-xs text-ink/60">{step.label}</p>
          </Link>
        ))}
      </div>
      <div className="mt-10 grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="font-display text-2xl text-forest-800">Awaiting approval</h2>
          <div className="mt-3 space-y-2">
            {(data?.awaiting || []).map((row) => (
              <Link key={row.id} href={`/waybills/${row.id}`} className="ticket flex items-center justify-between rounded-2xl bg-paper p-4">
                <div>
                  <p className="font-semibold text-forest-800">{row.waybill_number}</p>
                  <p className="text-sm text-ink/70">{row.customer_name}</p>
                </div>
                <StatusPill status={row.status} label={row.status_display} />
              </Link>
            ))}
            {!data?.awaiting?.length && <p className="text-sm text-ink/60">Nothing waiting on a supervisor.</p>}
          </div>
        </section>
        <section>
          <h2 className="font-display text-2xl text-forest-800">In the field</h2>
          <div className="mt-3 space-y-2">
            {(data?.in_field || []).map((row) => (
              <Link key={row.id} href={`/waybills/${row.id}`} className="ticket flex items-center justify-between rounded-2xl bg-paper p-4">
                <div>
                  <p className="font-semibold text-forest-800">{row.waybill_number}</p>
                  <p className="text-sm text-ink/70">
                    {row.customer_name}
                    {row.driver_name ? ` · ${row.driver_name}` : ""}
                  </p>
                </div>
                <StatusPill status={row.status} label={row.status_display} />
              </Link>
            ))}
            {!data?.in_field?.length && <p className="text-sm text-ink/60">No loaded or dispatched runs right now.</p>}
          </div>
        </section>
      </div>
      <h2 className="mt-10 font-display text-2xl text-forest-800">Recent waybills</h2>
      <div className="mt-4 overflow-hidden rounded-2xl border border-forest-800/10 bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="bg-forest-800 text-cream">
            <tr>
              <th className="px-4 py-3">Waybill</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {data?.recent.map((row) => (
              <tr key={row.id} className="border-t border-forest-800/10">
                <td className="px-4 py-3">
                  <Link href={`/waybills/${row.id}`} className="font-semibold text-forest-800">
                    {row.waybill_number}
                  </Link>
                </td>
                <td className="px-4 py-3">{row.customer_name}</td>
                <td className="px-4 py-3">
                  <StatusPill status={row.status} label={row.status_display} />
                </td>
                <td className="px-4 py-3 text-ink/60">{formatWhen(row.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.recent.length && <p className="px-4 py-6 text-sm text-ink/60">No waybills yet. Create the first pad from sales.</p>}
      </div>
    </AppShell>
  );
}
