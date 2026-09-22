"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, StatusPill, formatWhen } from "@/components/AppShell";
import { WaybillPad } from "@/components/WaybillPad";
import { api, mediaUrl, type Waybill } from "@/lib/api";

export default function WaybillDetailPage() {
  const params = useParams<{ id: string }>();
  const [waybill, setWaybill] = useState<Waybill | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Waybill>("/waybills/" + params.id + "/")
      .then(setWaybill)
      .catch((err) => setError(err.message));
  }, [params.id]);

  if (!waybill) {
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
          <p className="text-sm uppercase tracking-[0.18em] text-gold-600">Safisana Sales waybill</p>
          <h1 className="font-display text-4xl text-forest-800">{waybill.waybill_number}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill status={waybill.status} label={waybill.status_display} />
            <span className="text-xs text-ink/55">
              Created by {waybill.created_by_detail?.full_name || "Sales"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {waybill.verification_token && waybill.status === "completed" && (
            <a
              className="tap rounded-xl border border-forest-800/15 bg-paper px-4 py-3 text-sm font-semibold text-forest-800"
              href={"/verify/" + waybill.verification_token}
              target="_blank"
              rel="noreferrer"
            >
              Verify QR record
            </a>
          )}
          {waybill.pdf_file && (
            <a
              className="tap rounded-xl bg-gold-500 px-4 py-3 text-sm font-semibold text-forest-950"
              href={mediaUrl(waybill.pdf_file)}
              target="_blank"
              rel="noreferrer"
            >
              Download PDF v{waybill.pdf_version}
            </a>
          )}
        </div>
      </div>

      {waybill.status === "draft" && (
        <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This is a draft Sales document. There is no approval queue: a waybill becomes complete when the required sign-off
          signatures are captured and the Sales pad completes it.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <WaybillPad waybill={waybill} />

          {!!waybill.photos.length && (
            <section>
              <h2 className="mb-3 font-display text-xl text-forest-800">Optional digital proof</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {waybill.photos.map((photo) => (
                  <a key={photo.id} href={mediaUrl(photo.image)} target="_blank" rel="noreferrer">
                    <img
                      src={mediaUrl(photo.image)}
                      alt={photo.caption || "Waybill proof"}
                      className="h-28 w-full rounded-2xl object-cover"
                    />
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl bg-forest-950 p-5 text-cream">
            <p className="text-xs uppercase tracking-[0.18em] text-gold-400">Record</p>
            <h2 className="mt-1 font-display text-xl">Sales sign-off</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-cream/55">Authorised by</dt>
                <dd>{waybill.authorised_by_name || "—"}</dd>
              </div>
              <div>
                <dt className="text-cream/55">Dispatched by</dt>
                <dd>{waybill.dispatched_by_name || "—"}</dd>
              </div>
              <div>
                <dt className="text-cream/55">Received by</dt>
                <dd>{waybill.received_by || "—"}</dd>
              </div>
              <div>
                <dt className="text-cream/55">Completed</dt>
                <dd>{formatWhen(waybill.delivery_at)}</dd>
              </div>
              <div>
                <dt className="text-cream/55">GPS</dt>
                <dd>
                  {waybill.delivery_lat && waybill.delivery_lng
                    ? waybill.delivery_lat + ", " + waybill.delivery_lng
                    : "Optional proof not captured"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-3xl bg-paper p-5">
            <h2 className="font-display text-xl">Audit trail</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {waybill.audit_logs.map((log) => (
                <li key={log.id}>
                  <span className="font-semibold">{log.action.replaceAll("_", " ")}</span>
                  {log.to_status ? " → " + log.to_status.replaceAll("_", " ") : ""}
                  <span className="block text-xs text-ink/50">
                    {log.actor_name} · {formatWhen(log.created_at)}
                  </span>
                </li>
              ))}
            </ol>
            {!waybill.audit_logs.length && <p className="mt-3 text-sm text-ink/55">No audit events yet.</p>}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
