"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, StatusPill, formatWhen } from "@/components/AppShell";
import { api, readUser, type WaybillList } from "@/lib/api";

type Dash = {
  counts: {
    total: number;
    draft: number;
    completed: number;
    voided: number;
    waiting_sync: number;
  };
  today: { created: number; completed: number };
  recent: WaybillList[];
};

export default function DashboardPage() {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    const user = readUser();
    if (user) setName(user.full_name.split(" ")[0] || user.full_name);
    api<Dash>("/waybills/dashboard/")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const cards = [
    ["Total waybills", data?.counts.total ?? "—", "/waybills"],
    ["Drafts", data?.counts.draft ?? "—", "/waybills?status=draft"],
    ["Completed", data?.counts.completed ?? "—", "/waybills?status=completed"],
    ["Waiting to sync", data?.counts.waiting_sync ?? "—", "/waybills"],
  ] as const;

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-gold-600">Safisana Sales</p>
          <h1 className="font-display text-4xl text-forest-800">
            {name ? name + ", here are the Sales waybills" : "Sales waybills"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/65">
            The Authorised, Dispatch and Received signatures on the waybill are the complete sign-off record.
          </p>
        </div>
        <Link href="/field/new" className="tap rounded-xl bg-forest-800 px-4 py-3 text-sm font-semibold text-cream">
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

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-forest-950 p-5 text-cream">
          <p className="text-xs uppercase tracking-[0.18em] text-gold-400">Today</p>
          <p className="mt-2 font-display text-3xl">{data?.today.created ?? "—"} created</p>
          <p className="mt-1 text-sm text-cream/70">{data?.today.completed ?? "—"} completed</p>
        </div>
        <Link href="/field" className="rounded-2xl bg-paper p-5 shadow-ticket">
          <p className="text-xs uppercase tracking-[0.18em] text-gold-600">Field pad</p>
          <p className="mt-2 font-display text-2xl text-forest-800">Open the offline Sales pad</p>
          <p className="mt-1 text-sm text-ink/65">Create, sign and sync waybills from a phone or tablet.</p>
        </Link>
      </div>

      <h2 className="mt-10 font-display text-2xl text-forest-800">Recent waybills</h2>
      <div className="mt-4 overflow-hidden rounded-2xl border border-forest-800/10 bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="bg-forest-800 text-cream">
            <tr>
              <th className="px-4 py-3">Waybill</th>
              <th className="px-4 py-3">Deliver to</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {data?.recent.map((row) => (
              <tr key={row.id} className="border-t border-forest-800/10">
                <td className="px-4 py-3">
                  <Link href={"/waybills/" + row.id} className="font-semibold text-forest-800">
                    {row.waybill_number}
                  </Link>
                </td>
                <td className="px-4 py-3">{row.customer_name}</td>
                <td className="px-4 py-3">{row.created_by_name}</td>
                <td className="px-4 py-3">
                  <StatusPill status={row.status} label={row.status_display} />
                </td>
                <td className="px-4 py-3 text-ink/60">{formatWhen(row.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.recent.length && <p className="px-4 py-6 text-sm text-ink/60">No waybills yet.</p>}
      </div>
    </AppShell>
  );
}
