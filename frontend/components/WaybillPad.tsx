"use client";

import { mediaUrl, type Waybill } from "@/lib/api";
import { formatDate, formatWhen } from "@/lib/format";

export function WaybillPad({ waybill }: { waybill: Waybill }) {
  const customer = waybill.deliver_to || waybill.customer_detail?.name || "—";
  const contact = waybill.delivery_contact_name || waybill.customer_detail?.contact_name || "—";
  const address = waybill.delivery_address_text || waybill.customer_detail?.delivery_address || "—";
  const phone = waybill.contact_phone || waybill.customer_detail?.phone || "—";

  return (
    <article className="waybill-pad rounded-[4px] px-5 py-5 sm:px-8 sm:py-7">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#7fa3b6] pb-4">
        <div className="flex items-center gap-3">
          <div className="waybill-mark" aria-hidden />
          <div>
            <p className="text-lg font-semibold tracking-wide">Safisana</p>
            <p className="font-display text-3xl leading-none">WAYBILL</p>
          </div>
        </div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.18em]">No.</p>
          <p className="mt-1 border border-[#3d6680] px-4 py-1 font-mono text-lg">{waybill.waybill_number}</p>
        </div>
        <address className="not-italic text-right text-xs leading-5">
          <b>Safisana Ghana Limited</b>
          <br />
          P.O. Box CT 8312, Cantonments
          <br />
          Accra, Ghana
          <br />
          +233 (302) 972380
          <br />
          invoice-gh@safisana.org
        </address>
      </header>

      <dl className="mt-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[#3d6680]">Deliver to</dt>
          <dd className="font-semibold">{customer}</dd>
        </div>
        <div>
          <dt className="text-[#3d6680]">Date</dt>
          <dd>{formatDate(waybill.document_date)}</dd>
        </div>
        <div>
          <dt className="text-[#3d6680]">Delivery contact</dt>
          <dd>{contact}</dd>
        </div>
        <div>
          <dt className="text-[#3d6680]">Contact phone</dt>
          <dd>{phone}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[#3d6680]">Address</dt>
          <dd>{address}</dd>
        </div>
      </dl>

      <table className="waybill-grid mt-5 text-sm">
        <thead>
          <tr>
            <th className="w-[58%]">Description</th>
            <th className="w-[12%]">Qty</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {waybill.items.map((item) => (
            <tr key={item.id}>
              <td className="px-2 py-2">{item.product_name}</td>
              <td className="px-2 py-2">
                {item.delivered_qty ?? item.loaded_qty ?? item.ordered_qty} {item.unit_of_measure}
              </td>
              <td className="px-2 py-2">{item.notes || item.batch_number || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 grid gap-6 border-t border-[#7fa3b6] pt-5 text-sm sm:grid-cols-2">
        <div className="space-y-2">
          <p>
            Authorised by: <b>{waybill.authorised_by_name || "—"}</b>
          </p>
          <p>Remarks: {waybill.authorised_remarks || "—"}</p>
        </div>
        <div className="space-y-2">
          <p>
            Dispatched by: <b>{waybill.dispatched_by_name || waybill.driver_detail?.full_name || "—"}</b>
          </p>
          <p className="italic">I certify that I have received the above items.</p>
          {waybill.customer_rep_name && (
            <p>
              Received by: <b>{waybill.customer_rep_name}</b>
              {waybill.customer_rep_role ? ` · ${waybill.customer_rep_role}` : ""}
            </p>
          )}
          {waybill.delivery_at && <p>Date: {formatWhen(waybill.delivery_at)}</p>}
        </div>
      </div>

      {(waybill.customer_signature || waybill.driver_signature) && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {waybill.customer_signature && (
            <figure className="rounded-xl bg-white/70 p-3">
              <figcaption className="text-xs uppercase tracking-wide text-[#3d6680]">Received signature</figcaption>
              <img src={mediaUrl(waybill.customer_signature)} alt="Customer signature" className="mt-1 h-20 object-contain" />
            </figure>
          )}
          {waybill.driver_signature && (
            <figure className="rounded-xl bg-white/70 p-3">
              <figcaption className="text-xs uppercase tracking-wide text-[#3d6680]">Driver signature</figcaption>
              <img src={mediaUrl(waybill.driver_signature)} alt="Driver signature" className="mt-1 h-20 object-contain" />
            </figure>
          )}
        </div>
      )}
    </article>
  );
}
