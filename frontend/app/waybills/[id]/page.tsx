"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell, StatusPill, formatWhen } from "@/components/AppShell";
import { WaybillPad } from "@/components/WaybillPad";
import { api, mediaUrl, readUser, type User, type Waybill } from "@/lib/api";

export default function WaybillDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [wb, setWb] = useState<Waybill | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [drivers, setDrivers] = useState<{ id: number; full_name: string }[]>([]);
  const [vehicles, setVehicles] = useState<{ id: number; registration_number: string }[]>([]);
  const [driver, setDriver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [reason, setReason] = useState("");
  const [loadQtys, setLoadQtys] = useState<Record<number, string>>({});
  const [batches, setBatches] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function refresh() {
    const data = await api<Waybill>(`/waybills/${params.id}/`);
    setWb(data);
    if (data.driver) setDriver(String(data.driver));
    if (data.vehicle) setVehicle(String(data.vehicle));
    const qtys: Record<number, string> = {};
    const batch: Record<number, string> = {};
    data.items.forEach((item) => {
      qtys[item.id] = item.loaded_qty || item.ordered_qty;
      batch[item.id] = item.batch_number || "";
    });
    setLoadQtys(qtys);
    setBatches(batch);
  }

  useEffect(() => {
    setUser(readUser());
    refresh().catch((err) => setError(err.message));
    api<{ results: { id: number; full_name: string }[] }>("/drivers/").then((d) => setDrivers(d.results));
    api<{ results: { id: number; registration_number: string }[] }>("/vehicles/").then((d) => setVehicles(d.results));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const actions = useMemo(() => {
    if (!wb || !user) return [];
    const role = user.role;
    const items: { key: string; label: string; run: () => Promise<void> }[] = [];
    const post = (path: string, body?: unknown) =>
      api(`/waybills/${wb.id}/${path}/`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      }).then(refresh);

    if (["sales", "supervisor", "admin"].includes(role) && wb.status === "draft") {
      items.push({ key: "submit", label: "Submit for approval", run: () => post("submit") });
    }
    if (["supervisor", "admin"].includes(role) && wb.status === "pending_approval") {
      items.push({ key: "approve", label: "Approve", run: () => post("approve") });
      items.push({
        key: "reject",
        label: "Return to draft",
        run: () => post("reject", { reason: reason || "Needs correction" }),
      });
    }
    if (["warehouse", "admin"].includes(role) && wb.status === "approved") {
      items.push({
        key: "load",
        label: "Confirm loaded",
        run: () =>
          post("load", {
            items: wb.items.map((item) => ({
              id: item.id,
              loaded_qty: loadQtys[item.id] || item.ordered_qty,
              batch_number: batches[item.id] || item.batch_number || "FT-DEMO",
            })),
          }),
      });
    }
    if (["warehouse", "supervisor", "admin"].includes(role) && ["loaded", "approved"].includes(wb.status)) {
      items.push({
        key: "dispatch",
        label: "Dispatch to driver",
        run: () => post("dispatch", { driver: Number(driver), vehicle: Number(vehicle) }),
      });
    }
    if (["driver", "admin"].includes(role) && ["dispatched", "in_transit", "loaded"].includes(wb.status)) {
      items.push({
        key: "field",
        label: "Open field delivery",
        run: async () => {
          router.push(`/field/run/${wb.id}`);
        },
      });
    }
    if (
      ["supervisor", "admin"].includes(role) &&
      !["delivered", "partially_delivered", "delivery_failed", "cancelled"].includes(wb.status)
    ) {
      items.push({
        key: "cancel",
        label: "Cancel",
        run: () => post("cancel", { reason: reason || "Cancelled by supervisor" }),
      });
    }
    return items;
  }, [wb, user, driver, vehicle, reason, router, loadQtys, batches]);

  if (!wb) {
    return (
      <AppShell>
        <p>{error || "Loading waybill…"}</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-gold-600">{wb.branch}</p>
          <h1 className="font-display text-4xl text-forest-800">{wb.waybill_number}</h1>
          <div className="mt-2">
            <StatusPill status={wb.status} label={wb.status_display} />
          </div>
        </div>
        {wb.pdf_file && (
          <a
            className="tap rounded-xl bg-gold-500 px-4 py-3 text-sm font-semibold text-forest-950"
            href={mediaUrl(wb.pdf_file)}
            target="_blank"
            rel="noreferrer"
          >
            Download PDF v{wb.pdf_version}
          </a>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <WaybillPad waybill={wb} />
          {!!wb.photos.length && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {wb.photos.map((photo) => (
                <a key={photo.id} href={mediaUrl(photo.image)} target="_blank" rel="noreferrer">
                  <img src={mediaUrl(photo.image)} alt={photo.caption} className="h-28 w-full rounded-2xl object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl bg-forest-950 p-5 text-cream">
            <h2 className="font-display text-xl">Actions</h2>
            {wb.status === "approved" && ["warehouse", "admin"].includes(user?.role || "") && (
              <div className="mt-3 space-y-2 rounded-2xl bg-white/10 p-3 text-sm">
                <p className="text-gold-400">Loaded quantities</p>
                {wb.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-2 gap-2">
                    <label className="text-xs">
                      {item.product_name}
                      <input
                        className="mt-1 w-full rounded-lg px-2 py-2 text-ink"
                        value={loadQtys[item.id] || ""}
                        onChange={(e) => setLoadQtys((current) => ({ ...current, [item.id]: e.target.value }))}
                      />
                    </label>
                    <label className="text-xs">
                      Batch
                      <input
                        className="mt-1 w-full rounded-lg px-2 py-2 text-ink"
                        value={batches[item.id] || ""}
                        onChange={(e) => setBatches((current) => ({ ...current, [item.id]: e.target.value }))}
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
            {["loaded", "approved", "dispatched"].includes(wb.status) && (
              <div className="mt-3 space-y-2">
                <select className="tap w-full rounded-lg px-2 py-3 text-ink" value={driver} onChange={(e) => setDriver(e.target.value)}>
                  <option value="">Select driver</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                    </option>
                  ))}
                </select>
                <select className="tap w-full rounded-lg px-2 py-3 text-ink" value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
                  <option value="">Select vehicle</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registration_number}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <input
              className="tap mt-3 w-full rounded-lg px-2 py-3 text-ink"
              placeholder="Reason (reject / cancel)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="mt-3 grid gap-2">
              {actions.map((action) => (
                <button
                  key={action.key}
                  disabled={!!busy}
                  className="tap rounded-xl bg-gold-500 py-3 text-sm font-semibold text-forest-950 disabled:opacity-50"
                  onClick={async () => {
                    setBusy(action.key);
                    setError("");
                    try {
                      await action.run();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Action failed");
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  {busy === action.key ? "Working…" : action.label}
                </button>
              ))}
              {!actions.length && <p className="text-sm text-cream/70">No actions for your role on this status.</p>}
            </div>
            {error && <p className="mt-3 text-sm text-rose-200">{error}</p>}
            <p className="mt-4 text-xs text-cream/60">
              Driver {wb.driver_detail?.full_name || "unassigned"} · Vehicle {wb.vehicle_detail?.registration_number || "—"}
              <br />
              Dispatch {formatWhen(wb.dispatch_at)} · Delivery {formatWhen(wb.delivery_at)}
              {wb.delivery_lat ? ` · GPS ${wb.delivery_lat}, ${wb.delivery_lng}` : ""}
            </p>
            {wb.verification_token && (
              <a className="mt-3 inline-block text-sm text-gold-400" href={`/verify/${wb.verification_token}`} target="_blank">
                Open QR verification page
              </a>
            )}
          </div>
          <div className="rounded-3xl bg-paper p-5">
            <h2 className="font-display text-xl">Audit trail</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {wb.audit_logs.map((log) => (
                <li key={log.id}>
                  <span className="font-semibold">{log.action}</span>
                  {log.to_status ? ` → ${log.to_status.replaceAll("_", " ")}` : ""}
                  <span className="block text-xs text-ink/50">
                    {log.actor_name} · {formatWhen(log.created_at)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
