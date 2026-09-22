"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import { formatWhen } from "@/lib/format";

type Verify = {
  valid: boolean;
  authentic?: boolean;
  issuer?: string;
  waybill_number: string;
  status: string;
  status_display: string;
  customer: string;
  deliver_to?: string;
  delivery_contact_name?: string;
  contact_phone?: string;
  created_at: string;
  completed_at: string | null;
  pdf_version: number;
  item_count: number;
  has_authorised_signature: boolean;
  has_dispatched_signature: boolean;
  has_received_signature: boolean;
  has_gps?: boolean;
  photo_count?: number;
};

export default function VerifyPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<Verify | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/verify/${params.token}/`)
      .then(async (res) => {
        if (!res.ok) throw new Error("This verification code is not a SafiRoute waybill.");
        setData(await res.json());
      })
      .catch((err) => setError(err.message));
  }, [params.token]);

  const complete =
    !!data?.has_authorised_signature &&
    !!data?.has_dispatched_signature &&
    !!data?.has_received_signature &&
    data.status === "completed";

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 py-10">
      <img src="/safiroute-logo.png" alt="SafiRoute" className="mb-8 w-56" />
      <div className="ticket rounded-3xl bg-paper p-8 shadow-ticket">
        <p className="text-sm uppercase tracking-[0.2em] text-gold-600">Public verification</p>
        {error && (
          <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-rose-800">
            <p className="font-display text-2xl">Not recognised</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        )}
        {data && (
          <>
            <div
              className={`mt-4 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                complete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
              }`}
            >
              {data.authentic ? "Authentic Safisana record" : "Record found"}
            </div>
            <h1 className="mt-3 font-display text-4xl text-forest-800">{data.waybill_number}</h1>
            <p className="mt-2 text-lg">
              {data.status_display} · {data.issuer || "Safisana Ghana Limited"}
            </p>

            <dl className="mt-6 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt>Deliver to</dt>
                <dd className="font-medium text-right">{data.deliver_to || data.customer}</dd>
              </div>
              {data.delivery_contact_name && (
                <div className="flex justify-between gap-4">
                  <dt>Contact</dt>
                  <dd className="text-right">{data.delivery_contact_name}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt>Created</dt>
                <dd>{formatWhen(data.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Completed</dt>
                <dd>{formatWhen(data.completed_at)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Signatures</dt>
                <dd>{complete ? "Authorised + Dispatch + Received" : "Incomplete"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>GPS proof</dt>
                <dd>{data.has_gps ? "Captured" : "Optional · not recorded"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Photos</dt>
                <dd>{data.photo_count ?? 0}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>PDF version</dt>
                <dd>v{data.pdf_version}</dd>
              </div>
            </dl>
          </>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-ink/50">
        Safisana Ghana · Read-only verification · No login required.
      </p>
    </div>
  );
}
