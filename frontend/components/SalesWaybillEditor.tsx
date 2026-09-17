"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SignaturePad } from "@/components/SignaturePad";
import { readUser } from "@/lib/api";
import {
  createSalesWaybill,
  deleteSalesWaybill,
  emptyLine,
  getSalesMobileSettings,
  getSalesReferences,
  getSalesWaybill,
  isMeaningfulSalesDraft,
  refreshSalesReferences,
  saveSalesWaybill,
  syncSalesWaybill,
  validateSalesWaybill,
  waybillChecklist,
  type SalesMobileReferences,
  type SalesMobileSettings,
  type SalesWaybill,
} from "@/lib/sales-mobile";

type Props = {
  waybillId?: string;
};

const EMPTY_REFERENCES: SalesMobileReferences = {
  id: "references",
  customers: [],
  products: [],
  savedAt: "",
};

function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const max = 1600;
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not prepare this photo."));
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", file.size > 1_200_000 ? 0.68 : 0.8));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that photo."));
    };
    image.src = url;
  });
}

function proofLabel(waybill: SalesWaybill) {
  if (waybill.latitude != null && waybill.longitude != null) {
    return `${waybill.latitude.toFixed(5)}, ${waybill.longitude.toFixed(5)}${
      waybill.gpsAccuracy ? ` · ±${Math.round(waybill.gpsAccuracy)}m` : ""
    }`;
  }
  return waybill.gpsUnavailableReason || "No location captured yet";
}

export function SalesWaybillEditor({ waybillId }: Props) {
  const router = useRouter();
  const [waybill, setWaybill] = useState<SalesWaybill | null>(null);
  const [settings, setSettings] = useState<SalesMobileSettings | null>(null);
  const [references, setReferences] = useState<SalesMobileReferences>(EMPTY_REFERENCES);
  const [ready, setReady] = useState(false);
  const [missingRecord, setMissingRecord] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [gpsBusy, setGpsBusy] = useState(false);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const user = readUser();
    if (!user) return;
    Promise.all([
      getSalesMobileSettings(),
      waybillId ? getSalesWaybill(waybillId) : Promise.resolve(null),
      getSalesReferences(),
    ]).then(([profile, existing, cachedReferences]) => {
      setSettings(profile);
      setReferences(cachedReferences);
      if (waybillId && !existing) {
        setMissingRecord(true);
      } else {
        setWaybill(existing || createSalesWaybill(user.full_name, profile));
      }
      setReady(true);
    });

    if (navigator.onLine) {
      void refreshSalesReferences().then(setReferences);
    }
  }, [waybillId]);

  useEffect(() => {
    if (!ready || !waybill || waybill.status === "completed" || !isMeaningfulSalesDraft(waybill)) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      void saveSalesWaybill(waybill).then(() => {
        setSaveNote(`Saved on this phone at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
        window.dispatchEvent(new Event("safiroute:saved"));
      });
    }, 650);
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    };
  }, [ready, waybill]);

  const checklist = useMemo(() => (waybill ? waybillChecklist(waybill) : []), [waybill]);
  const completeCount = checklist.filter((item) => item.done).length;
  const locked = waybill?.status === "completed";

  function patch(next: Partial<SalesWaybill>) {
    if (!waybill || locked) return;
    setWaybill({ ...waybill, ...next, updatedAt: new Date().toISOString() });
    setError("");
  }

  function updateItem(index: number, next: Partial<SalesWaybill["items"][number]>) {
    if (!waybill || locked) return;
    patch({ items: waybill.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item)) });
  }

  function applyCustomer(name: string) {
    if (!waybill || locked) return;
    const match = references.customers.find((customer) => customer.name.toLowerCase() === name.trim().toLowerCase());
    patch({
      deliverTo: name,
      ...(match
        ? {
            contactName: match.contact_name || waybill.contactName,
            contactPhone: match.phone || waybill.contactPhone,
            deliveryAddress: match.delivery_address || waybill.deliveryAddress,
          }
        : {}),
    });
  }

  async function saveDraft() {
    if (!waybill || locked) return;
    if (!isMeaningfulSalesDraft(waybill)) {
      setSaveNote("Start with the customer or a product line first.");
      return;
    }
    setBusy("save");
    const next: SalesWaybill = {
      ...waybill,
      status: "draft",
      syncStatus: "device_only",
      updatedAt: new Date().toISOString(),
    };
    await saveSalesWaybill(next);
    setWaybill(next);
    setSaveNote("Draft saved safely on this phone.");
    window.dispatchEvent(new Event("safiroute:saved"));
    setBusy("");
  }

  async function complete() {
    if (!waybill || locked) return;
    const missing = validateSalesWaybill(waybill);
    if (missing.length) {
      setError(`Before completing, add: ${missing.join(", ")}.`);
      document.getElementById("sales-before-complete")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!window.confirm(`Complete ${waybill.localNumber} for ${waybill.deliverTo}?\n\nAfter completion the waybill becomes read-only.`)) return;
    setBusy("complete");
    const now = new Date().toISOString();
    let saved: SalesWaybill = {
      ...waybill,
      status: "completed",
      syncStatus: "pending",
      completedAt: now,
      updatedAt: now,
    };
    await saveSalesWaybill(saved);
    window.dispatchEvent(new Event("safiroute:saved"));
    if (navigator.onLine) saved = await syncSalesWaybill(saved);
    setWaybill(saved);
    window.dispatchEvent(new Event("safiroute:saved"));
    setBusy("");
    router.push("/field");
  }

  async function retrySync() {
    if (!waybill || waybill.status !== "completed") return;
    setBusy("sync");
    const synced = await syncSalesWaybill(waybill);
    setWaybill(synced);
    window.dispatchEvent(new Event("safiroute:saved"));
    setBusy("");
  }

  async function removeDraft() {
    if (!waybill || waybill.status === "completed") return;
    if (!window.confirm("Delete this draft from this phone?")) return;
    await deleteSalesWaybill(waybill.id);
    window.dispatchEvent(new Event("safiroute:saved"));
    router.push("/field");
  }

  function captureGps() {
    if (!waybill || locked) return;
    if (!navigator.geolocation) {
      patch({ gpsUnavailableReason: "GPS is not available on this phone." });
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        patch({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          gpsAccuracy: position.coords.accuracy,
          gpsCapturedAt: new Date(position.timestamp).toISOString(),
          gpsUnavailableReason: "",
        });
        setGpsBusy(false);
      },
      (gpsError) => {
        const reason =
          gpsError.code === 1
            ? "Location permission is off. Turn it on, or record why GPS is unavailable."
            : gpsError.code === 2
              ? "GPS is unavailable right now. Try outdoors, or record a reason."
              : "Location timed out. Try again, or record a reason.";
        patch({ gpsUnavailableReason: reason });
        setGpsBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  if (!ready) return <div className="sales-loading-card">Opening your digital waybill pad…</div>;

  if (missingRecord || !waybill) {
    return (
      <div className="sales-empty-state">
        <div className="sales-empty-paper" aria-hidden="true"><span>!</span></div>
        <h3>Waybill not found on this phone</h3>
        <p>It may have been removed or restored on another device.</p>
        <Link href="/field">Back to waybills</Link>
      </div>
    );
  }

  return (
    <div className="sales-editor">
      <datalist id="sales-customer-options">
        {references.customers.map((customer) => <option key={customer.id} value={customer.name} />)}
      </datalist>
      <datalist id="sales-product-options">
        {references.products.map((product) => <option key={product.id} value={product.name || product.sku || ""} />)}
      </datalist>

      <div className="sales-editor-head">
        <button type="button" onClick={() => router.push("/field")} className="sales-back-button" aria-label="Back to waybills">←</button>
        <div>
          <p className="sales-eyebrow">{locked ? "COMPLETED WAYBILL" : waybillId ? "EDIT DRAFT" : "NEW WAYBILL"}</p>
          <h1>{waybill.serverNumber || waybill.localNumber}</h1>
          <p>{locked ? "Read-only record" : saveNote || "Changes save automatically on this phone."}</p>
        </div>
      </div>

      {locked && (
        <div className={`sales-complete-banner ${waybill.syncStatus === "synced" ? "is-synced" : "is-pending"}`}>
          <div>
            <strong>{waybill.syncStatus === "synced" ? "✓ Verified on HQ" : "✓ Completed on this phone"}</strong>
            <span>
              {waybill.syncStatus === "synced"
                ? `Server waybill ${waybill.serverNumber || "accepted"}`
                : waybill.syncError || "Waiting for a connection to send to HQ."}
            </span>
          </div>
          {waybill.syncStatus !== "synced" && navigator.onLine && (
            <button type="button" onClick={retrySync} disabled={busy === "sync"}>{busy === "sync" ? "Sending…" : "Send now"}</button>
          )}
        </div>
      )}

      <section className="sales-form-card sales-paper-card">
        <div className="sales-paper-head">
          <div className="sales-paper-brand">
            <img src="/safiroute-icon.png" alt="" />
            <span><b>Safisana</b><strong>WAYBILL</strong></span>
          </div>
          <div className="sales-paper-number"><small>No.</small><b>{waybill.serverNumber || waybill.localNumber}</b></div>
        </div>
        <p className="sales-paper-help">Fill this like the paper pad. Only the essential fields are shown.</p>
      </section>

      <section className="sales-form-card">
        <div className="sales-step-heading"><span>1</span><div><h2>Customer</h2><p>Who is receiving this delivery?</p></div></div>
        <div className="sales-form-grid">
          <label className="sales-field sales-field-wide">Deliver to *
            <input list="sales-customer-options" disabled={locked} autoComplete="organization" value={waybill.deliverTo} onChange={(event) => applyCustomer(event.target.value)} placeholder="Customer or company name" />
          </label>
          <label className="sales-field">Date
            <input disabled={locked} type="date" value={waybill.documentDate} onChange={(event) => patch({ documentDate: event.target.value })} />
          </label>
          <label className="sales-field">Contact name
            <input disabled={locked} autoComplete="name" value={waybill.contactName} onChange={(event) => patch({ contactName: event.target.value })} placeholder="Customer contact" />
          </label>
          <label className="sales-field">Phone
            <input disabled={locked} inputMode="tel" autoComplete="tel" value={waybill.contactPhone} onChange={(event) => patch({ contactPhone: event.target.value })} placeholder="024…" />
          </label>
          <label className="sales-field sales-field-wide">Delivery address *
            <textarea disabled={locked} rows={2} value={waybill.deliveryAddress} onChange={(event) => patch({ deliveryAddress: event.target.value })} placeholder="Where should the goods be delivered?" />
          </label>
        </div>
        {references.savedAt && <p className="sales-reference-note">Customer suggestions are saved for offline use.</p>}
      </section>

      <section className="sales-form-card">
        <div className="sales-step-heading"><span>2</span><div><h2>Items</h2><p>What is being delivered?</p></div></div>
        <div className="sales-mobile-lines">
          {waybill.items.map((item, index) => (
            <div className="sales-mobile-line" key={index}>
              <div className="sales-mobile-line-number">{index + 1}</div>
              <label className="sales-field sales-field-wide">Description
                <input list="sales-product-options" disabled={locked} value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} placeholder="e.g. Fortifer Organic Fertilizer 50kg" />
              </label>
              <label className="sales-field">Qty
                <input disabled={locked} type="number" min="0" step="0.01" inputMode="decimal" value={item.qty} onChange={(event) => updateItem(index, { qty: event.target.value })} placeholder="0" />
              </label>
              <label className="sales-field">Remarks
                <input disabled={locked} value={item.remarks} onChange={(event) => updateItem(index, { remarks: event.target.value })} placeholder="Optional" />
              </label>
            </div>
          ))}
        </div>
        {!locked && (
          <button type="button" className="sales-secondary-button sales-add-line" onClick={() => patch({ items: [...waybill.items, emptyLine()] })}>+ Add another line</button>
        )}
      </section>

      <section className="sales-form-card">
        <div className="sales-step-heading"><span>3</span><div><h2>Sales & dispatch</h2><p>Record who authorised and dispatched the goods.</p></div></div>
        <div className="sales-form-grid">
          <label className="sales-field">Authorised by *
            <input disabled={locked} value={waybill.authorisedBy} onChange={(event) => patch({ authorisedBy: event.target.value })} />
          </label>
          <label className="sales-field">Dispatched by *
            <input disabled={locked} value={waybill.dispatchedBy} onChange={(event) => patch({ dispatchedBy: event.target.value })} placeholder="Name" />
          </label>
          <label className="sales-field">Vehicle *
            <input disabled={locked} value={waybill.vehicleNumber} onChange={(event) => patch({ vehicleNumber: event.target.value.toUpperCase() })} placeholder={settings?.vehicleNumber || "GT 0000-00"} />
          </label>
          <label className="sales-field">Remarks
            <input disabled={locked} value={waybill.authorisedRemarks} onChange={(event) => patch({ authorisedRemarks: event.target.value })} placeholder="Optional" />
          </label>
        </div>
        {locked ? (
          <div className="sales-signature-readonly">
            <div><span>Sales signature</span>{waybill.authorisedSignature ? <img src={waybill.authorisedSignature} alt="Sales signature" /> : <em>Not captured</em>}</div>
            <div><span>Dispatch signature</span>{waybill.dispatchedSignature ? <img src={waybill.dispatchedSignature} alt="Dispatch signature" /> : <em>Not captured</em>}</div>
          </div>
        ) : (
          <div className="sales-signature-grid">
            <SignaturePad label="Sales / Authorised signature *" value={waybill.authorisedSignature} onChange={(value) => patch({ authorisedSignature: value })} />
            <SignaturePad label="Dispatch signature *" value={waybill.dispatchedSignature} onChange={(value) => patch({ dispatchedSignature: value })} />
          </div>
        )}
      </section>

      <section className="sales-form-card">
        <div className="sales-step-heading"><span>4</span><div><h2>Customer proof</h2><p>Customer confirms receipt; then capture location and a delivery photo.</p></div></div>
        <div className="sales-form-grid">
          <label className="sales-field">Received by *
            <input disabled={locked} value={waybill.receivedBy} onChange={(event) => patch({ receivedBy: event.target.value })} placeholder="Customer representative" />
          </label>
          <label className="sales-field">Role / position
            <input disabled={locked} value={waybill.receivedByRole} onChange={(event) => patch({ receivedByRole: event.target.value })} placeholder="Optional" />
          </label>
        </div>
        {locked ? (
          <div className="sales-signature-readonly single">
            <div><span>Customer signature</span>{waybill.customerSignature ? <img src={waybill.customerSignature} alt="Customer signature" /> : <em>Not captured</em>}</div>
          </div>
        ) : (
          <SignaturePad label="Customer / Received-by signature *" value={waybill.customerSignature} onChange={(value) => patch({ customerSignature: value })} />
        )}

        <div className="sales-proof-grid">
          <div className="sales-proof-card">
            <div className="sales-proof-icon" aria-hidden="true">⌖</div>
            <div><strong>GPS location *</strong><p>{proofLabel(waybill)}</p></div>
            {!locked && <button type="button" onClick={captureGps} disabled={gpsBusy}>{gpsBusy ? "Locating…" : "Capture"}</button>}
          </div>
          {!locked && waybill.latitude == null && (
            <label className="sales-field sales-gps-reason">If GPS cannot be captured
              <input value={waybill.gpsUnavailableReason} onChange={(event) => patch({ gpsUnavailableReason: event.target.value })} placeholder="Record why GPS is unavailable" />
            </label>
          )}
          <div className="sales-proof-card sales-photo-proof">
            <div className="sales-proof-icon" aria-hidden="true">▣</div>
            <div><strong>Delivery photo *</strong><p>{waybill.photo ? "Photo saved on this phone" : "Take a clear delivery photo"}</p></div>
            {!locked && (
              <label className="sales-photo-button">{waybill.photo ? "Retake" : "Camera"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    if (file.size > 20 * 1024 * 1024) {
                      setError("That photo is too large. Take a smaller camera photo.");
                      return;
                    }
                    try {
                      setBusy("photo");
                      patch({ photo: await fileToCompressedDataUrl(file) });
                    } catch (photoError) {
                      setError(photoError instanceof Error ? photoError.message : "Could not save that photo.");
                    } finally {
                      setBusy("");
                    }
                  }}
                />
              </label>
            )}
          </div>
          {waybill.photo && <img src={waybill.photo} alt="Delivery proof" className="sales-photo-preview" />}
          <label className="sales-field sales-field-wide">Delivery notes
            <textarea disabled={locked} rows={3} value={waybill.notes} onChange={(event) => patch({ notes: event.target.value })} placeholder="Optional delivery notes or observations" />
          </label>
        </div>
      </section>

      {!locked && (
        <section id="sales-before-complete" className="sales-checklist-card">
          <div className="sales-section-heading">
            <div><p className="sales-eyebrow">BEFORE COMPLETE</p><h2>{completeCount}/{checklist.length} ready</h2></div>
            <span>{Math.round((completeCount / Math.max(1, checklist.length)) * 100)}%</span>
          </div>
          <div className="sales-progress"><i style={{ width: `${(completeCount / Math.max(1, checklist.length)) * 100}%` }} /></div>
          <ul>{checklist.map((item) => <li key={item.id} className={item.done ? "done" : ""}><b>{item.done ? "✓" : "○"}</b><span>{item.label}</span></li>)}</ul>
        </section>
      )}

      {error && <div className="sales-error sales-editor-error">{error}</div>}

      {!locked && (
        <div className="sales-editor-actions">
          {waybillId && <button type="button" className="sales-danger-button" onClick={removeDraft}>Delete</button>}
          <button type="button" className="sales-secondary-button" onClick={saveDraft} disabled={Boolean(busy)}>{busy === "save" ? "Saving…" : "Save draft"}</button>
          <button type="button" className="sales-primary-button" onClick={complete} disabled={Boolean(busy)}>{busy === "complete" ? "Completing…" : busy === "photo" ? "Saving photo…" : "Complete waybill"}</button>
        </div>
      )}

      {locked && waybill.syncStatus === "synced" && waybill.verificationToken && (
        <Link href={`/verify/${waybill.verificationToken}`} className="sales-primary-button sales-verify-link">Verify this waybill</Link>
      )}
    </div>
  );
}
