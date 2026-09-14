"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, StatusPill } from "@/components/AppShell";
import { api, readUser, type WaybillList } from "@/lib/api";

export default function FieldHomePage() {
  const [rows, setRows] = useState<WaybillList[]>([]);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const user = readUser();
    const params = new URLSearchParams();
    if (user?.role === "driver") {
      params.set("driver", String(user.id));
    }
    api<{ results: WaybillList[] }>(`/waybills/?${params}`)
      .then((data) => {
        const assigned = data.results.filter((row) =>
          ["loaded", "dispatched", "in_transit"].includes(row.status)
        );
        setRows(assigned);
        localStorage.setItem("safiroute_offline_waybills", JSON.stringify(assigned));
      })
      .catch(() => {
        setOffline(true);
        const cached = localStorage.getItem("safiroute_offline_waybills");
        if (cached) setRows(JSON.parse(cached));
      });
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <p className="text-sm uppercase tracking-[0.18em] text-gold-600">Driver</p>
        <h1 className="font-display text-4xl text-forest-800">Field deliveries</h1>
        <p className="mt-2 text-sm text-ink/70">
          Download happens automatically. Complete a delivery even without signal — it queues and syncs once.
        </p>
        {offline && (
          <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900">
            Offline mode · showing last downloaded assignments
          </p>
        )}
        <div className="mt-6 space-y-3">
          {rows.map((row) => (
            <Link key={row.id} href={`/field/${row.id}`} className="ticket block rounded-2xl bg-paper p-4">
              <div className="flex items-center justify-between">
                <p className="font-display text-xl">{row.waybill_number}</p>
                <StatusPill status={row.status} label={row.status_display} />
              </div>
              <p className="mt-1 text-sm text-ink/70">{row.customer_name}</p>
            </Link>
          ))}
          {!rows.length && <p className="text-ink/60">No active field assignments.</p>}
        </div>
      </div>
    </AppShell>
  );
}
