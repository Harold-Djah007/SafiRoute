"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FieldShell } from "@/components/FieldShell";
import { StatusPill } from "@/components/AppShell";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { api, type Waybill } from "@/lib/api";
import { getGpsFix, type GpsFix } from "@/lib/gps";
import { compressFiles } from "@/lib/media";
import { mapsHref, telHref } from "@/lib/format";
import {
  cacheWaybill,
  clearDraft,
  ensureClientUuid,
  getQueueItem,
  readCachedWaybill,
  readDraft,
  saveDraft,
  saveQueueItem,
  submitDelivery,
  type QueueItem,
} from "@/lib/offline";

type Outcome = QueueItem["outcome"];

export default function FieldDeliveryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const rawId = String(params.id || "");
  const id = Number(rawId);
  const invalidId = !Number.isFinite(id);
  const customerPad = useRef<SignaturePadHandle>(null);
  const driverPad = useRef<SignaturePadHandle>(null);
  const restored = useRef(false);
  const [wb, setWb] = useState<Waybill | null>(null);
  const [outcome, setOutcome] = useState<Outcome>("delivered");
  const [rep, setRep] = useState("");
  const [role, setRole] = useState("Storekeeper");
  const [notes, setNotes] = useState("");
  const [failure, setFailure] = useState("");
  const [qtys, setQtys] = useState<Record<number, string>>({});
  const [rejected, setRejected] = useState<Record<number, string>>({});
  const [gps, setGps] = useState<GpsFix>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncState, setSyncState] = useState("ready");

  useEffect(() => {
    if (invalidId) {
      router.replace(rawId === "queue" || rawId === "sync" ? "/field/queue" : "/field");
      return;
    }
    api<Waybill>(`/waybills/${id}/`)
      .then(async (data) => {
        setWb(data);
        await cacheWaybill(data);
      })
      .catch(async () => {
        const cached = await readCachedWaybill(id);
        if (cached) {
          setWb(cached);
          setSyncState("offline");
        } else setError("This run was not downloaded. Connect once and tap Download for offline.");
      });
    getGpsFix().then(setGps);
  }, [id, invalidId, rawId, router]);

  useEffect(() => {
    if (!wb) return;
    const next: Record<number, string> = {};
    const rej: Record<number, string> = {};
    wb.items.forEach((item) => {
      next[item.id] = item.loaded_qty || item.ordered_qty;
      rej[item.id] = "0";
    });
    setQtys(next);
    setRejected(rej);
    readDraft(wb.id).then((draft) => {
      if (!draft || restored.current) return;
      restored.current = true;
      setOutcome(draft.outcome);
      setRep(draft.customerRepName);
      setRole(draft.customerRepRole || "Storekeeper");
      setNotes(draft.deliveryNotes);
      setFailure(draft.failureReason);
      if (Object.keys(draft.qtys).length) setQtys(draft.qtys);
      if (Object.keys(draft.rejected).length) setRejected(draft.rejected);
      if (draft.customerSignature) customerPad.current?.fromDataURL(draft.customerSignature);
      if (draft.driverSignature) driverPad.current?.fromDataURL(draft.driverSignature);
    });
    getQueueItem(wb.id).then((item) => {
      if (item) setSyncState("queued");
    });
  }, [wb]);

  useEffect(() => {
    if (!wb) return;
    const timer = setTimeout(() => {
      saveDraft({
        waybillId: wb.id,
        outcome,
        customerRepName: rep,
        customerRepRole: role,
        deliveryNotes: notes,
        failureReason: failure,
        qtys,
        rejected,
        customerSignature: customerPad.current?.toDataURL(),
        driverSignature: driverPad.current?.toDataURL(),
      }).catch(() => undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [wb, outcome, rep, role, notes, failure, qtys, rejected]);

  async function complete() {
    if (!wb) return;
    setBusy(true);
    setError("");
    if (outcome !== "delivery_failed" && !rep.trim()) {
      setBusy(false);
      setError("Enter the name of the person receiving the goods.");
      return;
    }
    if (outcome === "delivery_failed" && !failure.trim()) {
      setBusy(false);
      setError("Record why the delivery failed.");
      return;
    }
    if (outcome !== "delivery_failed" && customerPad.current?.isEmpty()) {
      setBusy(false);
      setError("Customer signature is required.");
      return;
    }
    if (driverPad.current?.isEmpty()) {
      setBusy(false);
      setError("Driver signature is required.");
      return;
    }
    if (!gps.lat && !gps.reason) {
      setBusy(false);
      setError("Wait for GPS, retry, or confirm it is unavailable.");
      return;
    }

    const item: QueueItem = {
      waybillId: wb.id,
      waybillNumber: wb.waybill_number,
      customerName: wb.deliver_to || wb.customer_detail?.name || "",
      clientUuid: ensureClientUuid(wb.id),
      queuedAt: Date.now(),
      outcome,
      customerRepName: rep.trim(),
      customerRepRole: role.trim(),
      deliveryNotes: notes.trim(),
      failureReason: failure.trim(),
      gpsUnavailableReason: gps.reason || "",
      lat: gps.lat,
      lng: gps.lng,
      gpsAccuracy: gps.acc,
      items: wb.items.map((line) => ({
        id: line.id,
        delivered_qty: qtys[line.id] || line.loaded_qty || line.ordered_qty,
        rejected_qty: rejected[line.id] || "0",
      })),
      customerSignature: customerPad.current?.toDataURL() || "",
      driverSignature: driverPad.current?.toDataURL() || "",
      photos,
    };

    try {
      await submitDelivery(item);
      await clearDraft(wb.id);
      setSyncState("synced");
      router.push(`/waybills/${wb.id}`);
    } catch (err) {
      await saveQueueItem(item);
      setSyncState("queued");
      setError(
        `${err instanceof Error ? err.message : "No signal"} — proof is stored on this phone and will send when 4G returns.`
      );
    } finally {
      setBusy(false);
    }
  }

  if (invalidId) {
    return (
      <FieldShell>
        <p>Opening field queue…</p>
      </FieldShell>
    );
  }

  if (!wb) {
    return (
      <FieldShell>
        <p className="text-base">{error || "Loading assignment…"}</p>
      </FieldShell>
    );
  }

  const address = wb.delivery_address_text || wb.customer_detail?.delivery_address;
  const phone = wb.contact_phone || wb.customer_detail?.phone;

  return (
    <FieldShell>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl text-forest-800">{wb.waybill_number}</h1>
            <p className="text-lg font-medium">{wb.deliver_to || wb.customer_detail?.name}</p>
          </div>
          <StatusPill status={wb.status} label={wb.status_display} />
        </div>
        <p className="text-sm text-ink/75">{address}</p>
        <div className="flex flex-wrap gap-2">
          {phone && (
            <a className="tap rounded-xl bg-paper px-3 py-2 text-sm font-semibold" href={telHref(phone)}>
              Call {phone}
            </a>
          )}
          {address && (
            <a className="tap rounded-xl bg-paper px-3 py-2 text-sm font-semibold" href={mapsHref(address)} target="_blank" rel="noreferrer">
              Open map
            </a>
          )}
        </div>
        <p className="rounded-xl bg-paper px-3 py-2 text-sm">
          {syncState === "queued" ? "Queued on this phone" : syncState === "offline" ? "Working offline" : "Ready to send"}
          {gps.lat
            ? ` · GPS ${gps.lat.toFixed(5)}, ${gps.lng?.toFixed(5)} ±${Math.round(gps.acc || 0)}m`
            : ` · ${gps.reason || "Getting GPS…"}`}
        </p>
        <button
          type="button"
          className="text-sm font-semibold text-forest-800 underline"
          onClick={async () => setGps(await getGpsFix())}
        >
          Refresh GPS
        </button>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["delivered", "Delivered"],
              ["partially_delivered", "Partial"],
              ["delivery_failed", "Failed"],
            ] as [Outcome, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setOutcome(value)}
              className={`tap rounded-2xl px-2 py-3 text-sm font-semibold ${
                outcome === value ? "bg-forest-800 text-cream" : "bg-paper"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <section className="rounded-3xl bg-paper p-4">
          <h2 className="font-display text-xl">Quantities</h2>
          <div className="mt-3 space-y-3">
            {wb.items.map((item) => (
              <div key={item.id} className="border-t border-forest-800/10 pt-3 first:border-0 first:pt-0">
                <p className="font-medium">{item.product_name}</p>
                <p className="text-xs text-ink/60">
                  Ordered {item.ordered_qty} · Loaded {item.loaded_qty || item.ordered_qty} {item.unit_of_measure}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-xs">
                    Delivered
                    <input
                      className="tap mt-1 w-full rounded-xl border px-3 py-2 text-base"
                      inputMode="decimal"
                      value={qtys[item.id] || ""}
                      onChange={(e) => setQtys((current) => ({ ...current, [item.id]: e.target.value }))}
                    />
                  </label>
                  <label className="text-xs">
                    Rejected
                    <input
                      className="tap mt-1 w-full rounded-xl border px-3 py-2 text-base"
                      inputMode="decimal"
                      value={rejected[item.id] || "0"}
                      onChange={(e) => setRejected((current) => ({ ...current, [item.id]: e.target.value }))}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>

        {outcome !== "delivery_failed" && (
          <>
            <input
              className="tap w-full rounded-2xl border px-3 py-3 text-base"
              placeholder="Received by (name)"
              value={rep}
              onChange={(e) => setRep(e.target.value)}
            />
            <input
              className="tap w-full rounded-2xl border px-3 py-3 text-base"
              placeholder="Role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </>
        )}
        {outcome === "delivery_failed" && (
          <textarea
            className="tap w-full rounded-2xl border px-3 py-3 text-base"
            placeholder="Why did delivery fail?"
            value={failure}
            onChange={(e) => setFailure(e.target.value)}
          />
        )}
        <textarea
          className="tap w-full rounded-2xl border px-3 py-3 text-base"
          placeholder="Delivery notes / remarks"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {outcome !== "delivery_failed" && <SignaturePad ref={customerPad} label="Received by — signature" />}
        <SignaturePad ref={driverPad} label="Driver signature" />

        <label className="tap block rounded-2xl border-2 border-dashed border-forest-800/30 bg-paper px-4 py-4 text-center text-sm font-semibold">
          Add delivery photos
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              const compressed = await compressFiles(files);
              setPhotos((current) => [...current, ...compressed.map((item) => item.preview)]);
            }}
          />
        </label>
        {!!photos.length && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((src, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                className="overflow-hidden rounded-xl"
              >
                <img src={src} alt="" className="h-24 w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        <p className="text-sm text-ink/70">
          I certify that I have received the above items. This signature is bound to this waybill, the time on this
          phone, and the GPS fix recorded here.
        </p>
        <button
          disabled={busy}
          onClick={complete}
          className="tap w-full rounded-2xl bg-forest-800 py-4 text-lg font-semibold text-cream disabled:opacity-50"
        >
          {busy ? "Saving…" : outcome === "delivery_failed" ? "Record failed delivery" : "Complete delivery"}
        </button>
      </div>
    </FieldShell>
  );
}
