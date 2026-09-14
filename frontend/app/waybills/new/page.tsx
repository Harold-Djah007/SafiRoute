"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

type Option = { id: number; name?: string; sku?: string; unit_of_measure?: string; account_number?: string };

export default function NewWaybillPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [customer, setCustomer] = useState("");
  const [salesOrder, setSalesOrder] = useState("");
  const [invoice, setInvoice] = useState("");
  const [po, setPo] = useState("");
  const [lines, setLines] = useState([{ product: "", ordered_qty: "1" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api<{ results: Option[] }>("/customers/"),
      api<{ results: Option[] }>("/products/"),
    ]).then(([c, p]) => {
      setCustomers(c.results);
      setProducts(p.results);
      if (c.results[0]) setCustomer(String(c.results[0].id));
      if (p.results[0]) setLines([{ product: String(p.results[0].id), ordered_qty: "20" }]);
    });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api<{ id: number }>("/waybills/", {
        method: "POST",
        body: JSON.stringify({
          customer: Number(customer),
          sales_order_ref: salesOrder,
          invoice_ref: invoice,
          po_ref: po,
          items: lines
            .filter((line) => line.product)
            .map((line) => ({ product: Number(line.product), ordered_qty: line.ordered_qty })),
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
      <p className="text-sm uppercase tracking-[0.18em] text-gold-600">Sales</p>
      <h1 className="font-display text-4xl text-forest-800">Draft waybill</h1>
      <form onSubmit={onSubmit} className="mt-6 max-w-3xl space-y-5 rounded-3xl bg-paper p-6 shadow-ticket ticket">
        <label className="block text-sm font-medium">Customer</label>
        <select className="w-full rounded-xl border px-3 py-2" value={customer} onChange={(e) => setCustomer(e.target.value)}>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.account_number})
            </option>
          ))}
        </select>
        <div className="grid gap-3 sm:grid-cols-3">
          <input className="rounded-xl border px-3 py-2" placeholder="Sales order" value={salesOrder} onChange={(e) => setSalesOrder(e.target.value)} />
          <input className="rounded-xl border px-3 py-2" placeholder="Invoice" value={invoice} onChange={(e) => setInvoice(e.target.value)} />
          <input className="rounded-xl border px-3 py-2" placeholder="Customer PO" value={po} onChange={(e) => setPo(e.target.value)} />
        </div>
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <select
                className="rounded-xl border px-3 py-2"
                value={line.product}
                onChange={(e) => {
                  const next = [...lines];
                  next[index].product = e.target.value;
                  setLines(next);
                }}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.sku}
                  </option>
                ))}
              </select>
              <input
                className="rounded-xl border px-3 py-2"
                type="number"
                min="0"
                step="0.01"
                value={line.ordered_qty}
                onChange={(e) => {
                  const next = [...lines];
                  next[index].ordered_qty = e.target.value;
                  setLines(next);
                }}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="text-sm font-semibold text-forest-800"
          onClick={() => setLines([...lines, { product: String(products[0]?.id || ""), ordered_qty: "1" }])}
        >
          + Add product line
        </button>
        {error && <p className="text-rose-700">{error}</p>}
        <button disabled={busy} className="rounded-xl bg-forest-800 px-5 py-3 font-semibold text-cream">
          {busy ? "Saving…" : "Save draft"}
        </button>
      </form>
    </AppShell>
  );
}
