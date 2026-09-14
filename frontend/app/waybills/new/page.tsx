"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, readUser } from "@/lib/api";

type Customer = {
  id: number;
  name: string;
  account_number?: string;
  delivery_address?: string;
  contact_name?: string;
  phone?: string;
};

type Product = { id: number; name?: string; sku?: string; unit_of_measure?: string };

type Line = { product: string; description: string; qty: string; remarks: string };

const emptyLine = (): Line => ({ product: "", description: "", qty: "", remarks: "" });

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewWaybillPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [deliverTo, setDeliverTo] = useState("");
  const [contactName, setContactName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [docDate, setDocDate] = useState(todayInput);
  const [authorisedBy, setAuthorisedBy] = useState("");
  const [authorisedRemarks, setAuthorisedRemarks] = useState("");
  const [dispatchedBy, setDispatchedBy] = useState("");
  const [lines, setLines] = useState<Line[]>(Array.from({ length: 8 }, emptyLine));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const user = readUser();
    if (user) setAuthorisedBy(user.full_name);
    Promise.all([
      api<{ results: Customer[] }>("/customers/"),
      api<{ results: Product[] }>("/products/"),
    ]).then(([c, p]) => {
      setCustomers(c.results);
      setProducts(p.results);
    });
  }, []);

  const matchedCustomer = useMemo(
    () => customers.find((c) => c.name.toLowerCase() === deliverTo.trim().toLowerCase()),
    [customers, deliverTo]
  );

  function applyCustomer(name: string) {
    setDeliverTo(name);
    const found = customers.find((c) => c.name === name);
    if (!found) return;
    setContactName(found.contact_name || "");
    setAddress(found.delivery_address || "");
    setPhone(found.phone || "");
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const items = lines
        .filter((line) => line.description.trim() || line.product)
        .map((line) => ({
          product: line.product ? Number(line.product) : null,
          product_name: line.description.trim(),
          ordered_qty: line.qty || "0",
          notes: line.remarks,
        }));
      if (!items.length) {
        throw new Error("Add at least one description line.");
      }
      const created = await api<{ id: number }>("/waybills/", {
        method: "POST",
        body: JSON.stringify({
          customer: matchedCustomer?.id || null,
          deliver_to: deliverTo,
          delivery_contact_name: contactName,
          delivery_address_text: address,
          contact_phone: phone,
          document_date: docDate,
          authorised_by_name: authorisedBy,
          authorised_remarks: authorisedRemarks,
          dispatched_by_name: dispatchedBy,
          items,
        }),
      });
      router.push(`/waybills/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create waybill");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <p className="text-sm uppercase tracking-[0.18em] text-gold-600">Sales document</p>
      <h1 className="font-display text-4xl text-forest-800">New waybill</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink/70">
        Fill the Safisana pad the same way as the paper book. The number is assigned when you save. Drivers later
        add GPS, photos, and the received-by signature in the field app.
      </p>

      <form onSubmit={onSubmit} className="waybill-pad mx-auto mt-6 max-w-4xl rounded-[4px] px-6 py-5 sm:px-8 sm:py-7">
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
            <p className="mt-1 border border-dashed border-[#3d6680] px-4 py-1 font-mono text-lg">Assigned on save</p>
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
            +233 (302) 972378
            <br />
            invoice-gh@safisana.org
            <br />
            www.safisana.org
          </address>
        </header>

        <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <label className="flex items-end gap-2 text-sm">
            <span className="shrink-0">Deliver to:</span>
            <input
              list="safisana-customers"
              className="waybill-line"
              required
              value={deliverTo}
              onChange={(e) => applyCustomer(e.target.value)}
            />
          </label>
          <label className="flex items-end gap-2 text-sm">
            <span className="shrink-0">Date:</span>
            <input type="date" className="waybill-line" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
          </label>
          <label className="flex items-end gap-2 text-sm">
            <span className="shrink-0">Delivery Contact Name:</span>
            <input className="waybill-line" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </label>
          <label className="flex items-end gap-2 text-sm">
            <span className="shrink-0">Contact Phone:</span>
            <input className="waybill-line" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="flex items-end gap-2 text-sm sm:col-span-2">
            <span className="shrink-0">Address:</span>
            <input className="waybill-line" value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
        </div>
        <datalist id="safisana-customers">
          {customers.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>

        <table className="waybill-grid mt-5">
          <thead>
            <tr>
              <th className="w-[58%]">Description</th>
              <th className="w-[12%]">Qty</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>
                  <input
                    list="safisana-products"
                    placeholder={index === 0 ? "e.g. Fortifer Organic Fertilizer 50kg" : ""}
                    value={line.description}
                    onChange={(e) => {
                      const name = e.target.value;
                      const product = products.find((p) => p.name === name);
                      updateLine(index, {
                        description: name,
                        product: product ? String(product.id) : "",
                      });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.qty}
                    onChange={(e) => updateLine(index, { qty: e.target.value })}
                  />
                </td>
                <td>
                  <input value={line.remarks} onChange={(e) => updateLine(index, { remarks: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="safisana-products">
          {products.map((p) => (
            <option key={p.id} value={p.name || ""} />
          ))}
        </datalist>
        <button
          type="button"
          className="mt-2 text-xs font-semibold underline"
          onClick={() => setLines((current) => [...current, emptyLine()])}
        >
          Add another line
        </button>

        <div className="mt-6 grid gap-6 border-t border-[#7fa3b6] pt-5 sm:grid-cols-2">
          <div className="space-y-3 text-sm">
            <label className="flex items-end gap-2">
              <span className="shrink-0">Authorised by:</span>
              <input className="waybill-line" value={authorisedBy} onChange={(e) => setAuthorisedBy(e.target.value)} />
            </label>
            <p>Signature: <span className="inline-block w-2/3 border-b border-dotted border-[#3d6680]">&nbsp;</span></p>
            <p>Date: <span className="inline-block w-1/2 border-b border-dotted border-[#3d6680]">&nbsp;</span></p>
            <label className="flex items-end gap-2">
              <span className="shrink-0">Remarks:</span>
              <input className="waybill-line" value={authorisedRemarks} onChange={(e) => setAuthorisedRemarks(e.target.value)} />
            </label>
          </div>
          <div className="space-y-3 text-sm">
            <label className="flex items-end gap-2">
              <span className="shrink-0">Dispatched by:</span>
              <input className="waybill-line" value={dispatchedBy} onChange={(e) => setDispatchedBy(e.target.value)} />
            </label>
            <p>Signature: <span className="inline-block w-2/3 border-b border-dotted border-[#3d6680]">&nbsp;</span></p>
            <p>Date: <span className="inline-block w-1/2 border-b border-dotted border-[#3d6680]">&nbsp;</span></p>
            <p className="pt-2 italic">I certify that I have received the above items.</p>
            <p>Received by: <span className="inline-block w-2/3 border-b border-dotted border-[#3d6680]">&nbsp;</span></p>
            <p>Signature: <span className="inline-block w-2/3 border-b border-dotted border-[#3d6680]">&nbsp;</span></p>
            <p>Date: <span className="inline-block w-1/2 border-b border-dotted border-[#3d6680]">&nbsp;</span></p>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-[#3d6680]">
            Digital copy · SafiRoute will add GPS, photos and a QR code at delivery.
          </p>
          <button disabled={busy} className="tap rounded-none bg-[#16324a] px-6 py-2 text-sm font-semibold text-white">
            {busy ? "Saving pad…" : "Save waybill"}
          </button>
        </div>
      </form>
    </AppShell>
  );
}
