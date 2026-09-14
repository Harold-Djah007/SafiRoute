"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { StatusPill } from "@/components/AppShell";
import { type Waybill } from "@/lib/api";
import { mapsHref, telHref } from "@/lib/format";
import {
  cacheWaybill,
  downloadFieldPack,
  flushQueue,
  listCachedWaybills,
  listQueue,
  removeQueueItem,
  submitDelivery,
  type QueueItem,
} from "@/lib/offline";

const ACTIVE = new Set(["loaded", "dispatched", "in_transit"]);

function FieldHomeInner() {
  const search = useSearchParams();
  const pathname = usePathname();
  const showQueue = search.get("tab") === "sync" || pathname.endsWith("/queue");
  const [rows, setRows] = useState<Waybill[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [offline, setOffline] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  const loadLocal = useCallback(async () => {
    const cached = await listCachedWaybills();
    setRows(cached.filter((row) => ACTIVE.has(row.status)));
    setQueue(await listQueue());
  }, []);

  async function download() {
    setBusy("download");
    setNote("");
    await loadLocal();
    try {
      const pack = await downloadFieldPack();
      setRows(pack.waybills.filter((row) => ACTIVE.has(row.status)));
      setOffline(false);
      setNote(`${pack.waybills.length} assignment${pack.waybills.length === 1 ? "" : "s"} saved on this phone.`);
    } catch {
      setOffline(true);
      await loadLocal();
      setNote("Could not reach SafiRoute. Showing last downloaded runs.");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    download();
    const on = () => {
      setOffline(false);
      flushQueue().then(loadLocal);
    };
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queuedIds = useMemo(() => new Set(queue.map((item) => item.waybillId)), [queue]);

  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-600">Driver</p>
      <h1 className="font-display text-4xl text-forest-800">Today&apos;s runs</h1>
      <p className="mt-2 text-base text-ink/75">
        Download before you leave coverage. Sign, photo, and GPS still work offline — they send when 4G comes back.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={download}
          className="tap rounded-2xl bg-forest-800 px-3 py-3 text-sm font-semibold text-cream disabled:opacity-60"
        >
          {busy === "download" ? "Saving…" : "Download for offline"}
        </button>
        <button
          type="button"
          disabled={!!busy || !queue.length}
          onClick={async () => {
            setBusy("sync");
            const result = await flushQueue();
            await loadLocal();
            setNote(result.sent ? `${result.sent} sent` : result.failed ? "Still waiting for signal" : "Queue empty");
            setBusy("");
          }}
          className="tap rounded-2xl border-2 border-forest-800 px-3 py-3 text-sm font-semibold text-forest-800 disabled:opacity-40"
        >
          {busy === "sync" ? "Sending…" : `Send queue (${queue.length})`}
        </button>
      </div>
      {(offline || note) && (
        <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${offline ? "bg-amber-100 text-amber-950" : "bg-emerald-50 text-forest-800"}`}>
          {note || "Offline mode"}
        </p>
      )}

      {showQueue || queue.length ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl text-forest-800">Waiting to send</h2>
          {!queue.length && <p className="mt-2 text-sm text-ink/60">Nothing queued. Completions send immediately when you have signal.</p>}
          <div className="mt-3 space-y-2">
            {queue.map((item) => (
              <div key={item.waybillId} className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <p className="font-display text-xl">{item.waybillNumber}</p>
                <p className="text-sm">{item.customerName}</p>
                <p className="mt-1 text-xs text-ink/60">Stored {new Date(item.queuedAt).toLocaleTimeString("en-GB")}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="tap rounded-xl bg-forest-800 px-3 py-2 text-sm font-semibold text-cream"
                    onClick={async () => {
                      try {
                        await submitDelivery(item);
                        await loadLocal();
                      } catch {
                        setNote("Still offline — kept on this phone.");
                      }
                    }}
                  >
                    Retry now
                  </button>
                  <button
                    type="button"
                    className="tap rounded-xl px-3 py-2 text-sm underline"
                    onClick={async () => {
                      await removeQueueItem(item.waybillId);
                      await loadLocal();
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-6 space-y-3">
        {rows.map((row) => {
          const address = row.delivery_address_text || row.customer_detail?.delivery_address;
          const phone = row.contact_phone || row.customer_detail?.phone;
          return (
            <article key={row.id} className="ticket rounded-3xl bg-paper p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-2xl text-forest-800">{row.waybill_number}</p>
                  <p className="text-base font-medium">{row.deliver_to || row.customer_detail?.name}</p>
                  <p className="text-sm text-ink/70">{address}</p>
                </div>
                <StatusPill status={row.status} label={row.status_display} />
              </div>
              {queuedIds.has(row.id) && (
                <p className="mt-2 rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-950">
                  Proof saved on phone — waiting for 4G
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {phone && (
                  <a className="tap rounded-xl bg-cream px-3 py-2 text-sm font-semibold" href={telHref(phone)}>
                    Call
                  </a>
                )}
                {address && (
                  <a className="tap rounded-xl bg-cream px-3 py-2 text-sm font-semibold" href={mapsHref(address)} target="_blank" rel="noreferrer">
                    Map
                  </a>
                )}
                <Link
                  href={`/field/${row.id}`}
                  className="tap ml-auto rounded-xl bg-gold-500 px-4 py-2 text-sm font-semibold text-forest-950"
                  onClick={() => cacheWaybill(row)}
                >
                  Open run
                </Link>
              </div>
            </article>
          );
        })}
        {!rows.length && busy !== "download" && (
          <div className="rounded-3xl border border-dashed border-forest-800/20 p-6 text-center">
            <p className="font-display text-2xl text-forest-800">No active runs</p>
            <p className="mt-2 text-sm text-ink/70">When warehouse dispatches a waybill to you, tap Download for offline before you leave the plant.</p>
          </div>
        )}
      </div>
    </>
  );
}

export default function FieldHomePage() {
  return (
    <Suspense fallback={<p>Opening runs…</p>}>
      <FieldHomeInner />
    </Suspense>
  );
}
