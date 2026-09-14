"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, StatusPill, formatWhen } from "@/components/AppShell";
import { api, type WaybillList } from "@/lib/api";

type Dash = {
  counts: Record<string, number>;
  today: { created: number; delivered: number; in_field: number };
  recent: WaybillList[];
};

export default function DashboardPage() {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Dash>("/waybills/dashboard/")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const cards = [
    ["Today created", data?.today.created ?? "—"],
    ["In the field", data?.today.in_field ?? "—"],
    ["Delivered today", data?.today.delivered ?? "—"],
    ["Awaiting approval", data?.counts.pending_approval ?? "—"],
  ];

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-gold-600">Operations</p>
          <h1 className="font-display text-4xl text-forest-800">Today at Ashaiman</h1>
        </div>
        <Link href="/waybills/new" className="rounded-xl bg-forest-800 px-4 py-2 text-sm font-semibold text-cream">
          New waybill
        </Link>
      </div>
      {error && <p className="mb-4 text-rose-700">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="ticket rounded-2xl bg-paper p-5 shadow-ticket">
            <p className="text-sm text-ink/60">{label}</p>
            <p className="mt-2 font-display text-4xl text-forest-800">{value}</p>
          </div>
        ))}
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
      </div>
    </AppShell>
  );
}
