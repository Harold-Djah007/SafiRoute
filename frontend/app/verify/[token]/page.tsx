"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import { formatWhen } from "@/components/AppShell";

type Verify = {
  valid: boolean;
  waybill_number: string;
  status: string;
  status_display: string;
  customer: string;
  branch: string;
  created_at: string;
  dispatch_at: string | null;
  delivery_at: string | null;
  pdf_version: number;
  item_count: number;
  has_customer_signature: boolean;
  has_driver_signature: boolean;
};

export default function VerifyPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<Verify | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/verify/${params.token}/`)
      .then(async (res) => {
        if (!res.ok) throw new Error("This verification code is not valid.");
        setData(await res.json());
      })
      .catch((err) => setError(err.message));
  }, [params.token]);

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-12">
      <img src="/safiroute-logo.png" alt="SafiRoute" className="mb-8 w-56" />
      <div className="ticket rounded-3xl bg-paper p-8 shadow-ticket">
        <p className="text-sm uppercase tracking-[0.2em] text-gold-600">Public verification</p>
        {error && <p className="mt-4 text-rose-700">{error}</p>}
        {data && (
          <>
            <h1 className="mt-2 font-display text-4xl text-forest-800">{data.waybill_number}</h1>
            <p className="mt-2 text-lg">
              {data.valid ? "Authentic SafiRoute waybill" : "Not valid"} · {data.status_display}
            </p>
            <dl className="mt-6 space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt>Customer</dt><dd className="font-medium">{data.customer}</dd></div>
              <div className="flex justify-between gap-4"><dt>Branch</dt><dd>{data.branch}</dd></div>
              <div className="flex justify-between gap-4"><dt>Created</dt><dd>{formatWhen(data.created_at)}</dd></div>
              <div className="flex justify-between gap-4"><dt>Dispatched</dt><dd>{formatWhen(data.dispatch_at)}</dd></div>
              <div className="flex justify-between gap-4"><dt>Delivered</dt><dd>{formatWhen(data.delivery_at)}</dd></div>
              <div className="flex justify-between gap-4"><dt>Signatures</dt><dd>{data.has_customer_signature && data.has_driver_signature ? "Customer + driver on file" : "Incomplete"}</dd></div>
              <div className="flex justify-between gap-4"><dt>PDF version</dt><dd>v{data.pdf_version}</dd></div>
            </dl>
          </>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-ink/50">Safisana Ghana · Read-only verification · No login required</p>
    </div>
  );
}
