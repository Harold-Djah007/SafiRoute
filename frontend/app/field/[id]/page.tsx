"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppShell, StatusPill } from "@/components/AppShell";
import { api, type Waybill } from "@/lib/api";

function uuid() {
  return crypto.randomUUID();
}

export default function FieldDeliveryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerPad = useRef<HTMLCanvasElement>(null);
  const driverPad = useRef<HTMLCanvasElement>(null);
  const [wb, setWb] = useState<Waybill | null>(null);
  const [rep, setRep] = useState("");
  const [role, setRole] = useState("Storekeeper");
  const [notes, setNotes] = useState("");
  const [gps, setGps] = useState<{ lat?: number; lng?: number; acc?: number; reason?: string }>({});
  const [photos, setPhotos] = useState<FileList | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncState, setSyncState] = useState("ready");

  useEffect(() => {
    api<Waybill>(`/waybills/${params.id}/`)
      .then((data) => {
        setWb(data);
        localStorage.setItem(`safiroute_wb_${params.id}`, JSON.stringify(data));
      })
      .catch(() => {
        const cached = localStorage.getItem(`safiroute_wb_${params.id}`);
        if (cached) {
          setWb(JSON.parse(cached));
          setSyncState("offline");
        } else setError("Waybill not downloaded for offline use.");
      });
    if (!navigator.geolocation) {
      setGps({ reason: "Device has no geolocation" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      () => setGps({ reason: "GPS unavailable at delivery site" }),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [params.id]);

  useEffect(() => {
    for (const canvas of [customerPad.current, driverPad.current]) {
      if (!canvas) continue;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.strokeStyle = "#0F5C2E";
      ctx.lineWidth = 2;
      let drawing = false;
      const point = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
      };
      const down = (event: PointerEvent) => {
        drawing = true;
        const p = point(event);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      };
      const move = (event: PointerEvent) => {
        if (!drawing) return;
        const p = point(event);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      };
      const up = () => {
        drawing = false;
      };
      canvas.addEventListener("pointerdown", down);
      canvas.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    }
  }, [wb]);

  function canvasBlob(canvas: HTMLCanvasElement | null): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!canvas) {
        resolve(null);
        return;
      }
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  }

  async function complete() {
    if (!wb) return;
    setBusy(true);
    setError("");
    const clientUuid = localStorage.getItem(`safiroute_uuid_${wb.id}`) || uuid();
    localStorage.setItem(`safiroute_uuid_${wb.id}`, clientUuid);
    const form = new FormData();
    form.append("outcome", "delivered");
    form.append("customer_rep_name", rep);
    form.append("customer_rep_role", role);
    form.append("delivery_notes", notes);
    form.append("client_uuid", clientUuid);
    form.append("device_timestamp", new Date().toISOString());
    form.append(
      "items",
      JSON.stringify(
        wb.items.map((item) => ({
          id: item.id,
          delivered_qty: item.loaded_qty || item.ordered_qty,
          rejected_qty: "0",
        }))
      )
    );
    if (gps.lat && gps.lng) {
      form.append("lat", String(gps.lat));
      form.append("lng", String(gps.lng));
      form.append("gps_accuracy", String(gps.acc || ""));
    } else {
      form.append("gps_unavailable_reason", gps.reason || "GPS unavailable");
    }
    const customerSig = await canvasBlob(customerPad.current);
    const driverSig = await canvasBlob(driverPad.current);
    if (customerSig) form.append("customer_signature", customerSig, "customer.png");
    if (driverSig) form.append("driver_signature", driverSig, "driver.png");
    if (photos) {
      Array.from(photos).forEach((file) => form.append("photos", file));
    }

    const payload = { form, id: wb.id, clientUuid };
    try {
      await api(`/waybills/${wb.id}/start_transit/`, { method: "POST" }).catch(() => undefined);
      await api(`/waybills/${wb.id}/complete_delivery/`, { method: "POST", body: form });
      localStorage.removeItem(`safiroute_queue_${wb.id}`);
      setSyncState("synced");
      router.push(`/waybills/${wb.id}`);
    } catch (err) {
      localStorage.setItem(`safiroute_queue_${wb.id}`, JSON.stringify({ queuedAt: Date.now(), clientUuid }));
      setSyncState("queued");
      setError(
        `${err instanceof Error ? err.message : "Offline"} — delivery stored locally and will retry. Client id ${payload.clientUuid}`
      );
    } finally {
      setBusy(false);
    }
  }

  if (!wb) {
    return (
      <AppShell>
        <p>{error || "Loading assignment…"}</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl text-forest-800">{wb.waybill_number}</h1>
          <StatusPill status={wb.status} label={wb.status_display} />
        </div>
        <p className="text-sm">
          {wb.customer_detail.name}
          <br />
          {wb.customer_detail.delivery_address}
        </p>
        <p className="rounded-xl bg-cream px-3 py-2 text-xs">
          Sync: {syncState}
          {gps.lat ? ` · GPS ${gps.lat.toFixed(5)}, ${gps.lng?.toFixed(5)}` : ` · ${gps.reason || "locating…"}`}
        </p>
        <div className="rounded-2xl bg-paper p-4">
          {wb.items.map((item) => (
            <p key={item.id} className="text-sm">
              {item.product_name} · {item.loaded_qty || item.ordered_qty} {item.unit_of_measure}
            </p>
          ))}
        </div>
        <input className="w-full rounded-xl border px-3 py-2" placeholder="Customer representative name" value={rep} onChange={(e) => setRep(e.target.value)} />
        <input className="w-full rounded-xl border px-3 py-2" placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} />
        <textarea className="w-full rounded-xl border px-3 py-2" placeholder="Delivery notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <label className="block text-sm font-medium">Customer signature</label>
        <canvas ref={customerPad} width={360} height={140} className="w-full rounded-xl border bg-white touch-none" />
        <label className="block text-sm font-medium">Driver signature</label>
        <canvas ref={driverPad} width={360} height={140} className="w-full rounded-xl border bg-white touch-none" />
        <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => setPhotos(e.target.files)} />
        {error && <p className="text-sm text-rose-700">{error}</p>}
        <p className="text-xs text-ink/60">
          I confirm the goods listed were delivered in the quantities recorded, and that this signature is bound to this waybill, timestamp, and GPS record.
        </p>
        <button disabled={busy || !rep} onClick={complete} className="w-full rounded-xl bg-forest-800 py-3 font-semibold text-cream disabled:opacity-50">
          {busy ? "Completing…" : "Complete delivery"}
        </button>
      </div>
    </AppShell>
  );
}
