"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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

function paperValidation(waybill: SalesWaybill) {
  const missing: string[] = [];
  const hasDescription = waybill.items.some((item) => item.description.trim());
  if (!waybill.deliverTo.trim()) missing.push("Deliver to");
  if (!waybill.deliveryAddress.trim()) missing.push("Address");
  if (!hasDescription) missing.push("Description");
  if (!waybill.authorisedBy.trim()) missing.push("Authorised by");
  if (!waybill.authorisedSignature) missing.push("Authorised signature");
  if (!waybill.dispatchedBy.trim()) missing.push("Dispatched by");
  if (!waybill.dispatchedSignature) missing.push("Dispatch signature");
  if (!waybill.receivedBy.trim()) missing.push("Received by");
  if (!waybill.customerSignature) missing.push("Received signature");
  return missing;
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
      if (waybillId && !existing) setMissingRecord(true);
      else setWaybill(existing || createSalesWaybill(user.full_name, profile));
      setReady(true);
    });

    if (navigator.onLine) void refreshSalesReferences().then(setReferences);
  }, [waybillId]);

  useEffect(() => {
    if (!ready || !waybill || waybill.status === "completed" || !isMeaningfulSalesDraft(waybill)) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      void saveSalesWaybill(waybill).then(() => {
        setSaveNote(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
        window.dispatchEvent(new Event("safiroute:saved"));
      });
    }, 650);
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    };
  }, [ready, waybill]);

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
      setSaveNote("Start with the customer or description first.");
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
    setSaveNote("Draft saved on this phone.");
    window.dispatchEvent(new Event("safiroute:saved"));
    setBusy("");
  }

  async function complete() {
    if (!waybill || locked) return;
    const missing = paperValidation(waybill);
    if (missing.length) {
      setError(`Please complete: ${missing.join(", ")}.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
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
      () => {
        patch({ gpsUnavailableReason: "Location was not captured." });
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
    <div className="sales-editor sales-editor-paper-simple">
      <datalist id="sales-customer-options">
        {references.customers.map((customer) => <option key={customer.id} value={customer.name} />)}
      </datalist>
      <datalist id="sales-product-options">
        {references.products.map((product) => <option key={product.id} value={product.name || product.sku || ""} />)}
      </datalist>

      <div className="sales-editor-head paper-editor-head">
        <button type="button" onClick={() => router.push("/field")} className="sales-back-button" aria-label="Back to waybills">←</button>
        <div>
          <p className="sales-eyebrow">{locked ? "COMPLETED WAYBILL" : waybillId ? "EDIT WAYBILL" : "NEW WAYBILL"}</p>
          <h1>{waybill.serverNumber || waybill.localNumber}</h1>
          <p>{locked ? "Read-only record" : saveNote || "Autosaves on this phone"}</p>
        </div>
      </div>

      {error && <div className="sales-error sales-editor-error">{error}</div>}

      {locked && (
        <div className={`sales-complete-banner ${waybill.syncStatus === "synced" ? "is-synced" : "is-pending"}`}>
          <div>
            <strong>{waybill.syncStatus === "synced" ? "✓ Verified on HQ" : "✓ Completed on this phone"}</strong>
            <span>{waybill.syncStatus === "synced" ? `Server waybill ${waybill.serverNumber || "accepted"}` : waybill.syncError || "Waiting to send to HQ."}</span>
          </div>
          {waybill.syncStatus !== "synced" && navigator.onLine && (
            <button type="button" onClick={retrySync} disabled={busy === "sync"}>{busy === "sync" ? "Sending…" : "Send now"}</button>
          )}
        </div>
      )}

      <section className="paper-waybill-sheet">
        <header className="paper-waybill-header">
          <div className="paper-waybill-brand">
            <img src="/safiroute-icon.png" alt="" />
            <div><strong>Safisana</strong><span>WAYBILL</span></div>
          </div>
          <div className="paper-waybill-number"><small>No.</small><b>{waybill.serverNumber || waybill.localNumber}</b></div>
          <div className="paper-company-copy">
            <b>Safisana Ghana Limited</b>
            <span>Accra, Ghana</span>
            <span>invoice-gh@safisana.org</span>
            <span>www.safisana.org</span>
          </div>
        </header>

        <div className="paper-top-fields">
          <label className="paper-line-field paper-field-wide">Deliver to:
            <input list="sales-customer-options" disabled={locked} value={waybill.deliverTo} onChange={(event) => applyCustomer(event.target.value)} />
          </label>
          <label className="paper-line-field">Date:
            <input disabled={locked} type="date" value={waybill.documentDate} onChange={(event) => patch({ documentDate: event.target.value })} />
          </label>
          <label className="paper-line-field paper-field-wide">Delivery Contact Name:
            <input disabled={locked} value={waybill.contactName} onChange={(event) => patch({ contactName: event.target.value })} />
          </label>
          <label className="paper-line-field">Contact Phone:
            <input disabled={locked} inputMode="tel" value={waybill.contactPhone} onChange={(event) => patch({ contactPhone: event.target.value })} />
          </label>
          <label className="paper-line-field paper-address-line">Address:
            <input disabled={locked} value={waybill.deliveryAddress} onChange={(event) => patch({ deliveryAddress: event.target.value })} />
          </label>
        </div>

        <div className="paper-items-table">
          <div className="paper-items-head"><span>Description</span><span>Remarks</span></div>
          {waybill.items.map((item, index) => (
            <div className="paper-item-row" key={index}>
              <input
                aria-label={`Description ${index + 1}`}
                list="sales-product-options"
                disabled={locked}
                value={item.description}
                onChange={(event) => updateItem(index, { description: event.target.value })}
              />
              <input
                aria-label={`Remarks ${index + 1}`}
                disabled={locked}
                value={item.remarks}
                onChange={(event) => updateItem(index, { remarks: event.target.value })}
              />
            </div>
          ))}
          {!locked && (
            <button type="button" className="paper-add-row" onClick={() => patch({ items: [...waybill.items, emptyLine()] })}>+ Add line</button>
          )}
        </div>

        <div className="paper-signoff-grid">
          <div className="paper-signoff-column">
            <label className="paper-line-field">Authorised by:
              <input disabled={locked} value={waybill.authorisedBy} onChange={(event) => patch({ authorisedBy: event.target.value })} />
            </label>
            {locked ? (
              <div className="paper-readonly-signature"><span>Signature:</span>{waybill.authorisedSignature && <img src={waybill.authorisedSignature} alt="Authorised signature" />}</div>
            ) : (
              <SignaturePad label="Signature:" value={waybill.authorisedSignature} onChange={(value) => patch({ authorisedSignature: value })} hint="Sign on the line" />
            )}
            <div className="paper-static-line"><span>Date:</span><b>{waybill.documentDate}</b></div>
            <label className="paper-line-field paper-remarks-field">Remarks:
              <textarea disabled={locked} rows={3} value={waybill.authorisedRemarks} onChange={(event) => patch({ authorisedRemarks: event.target.value })} />
            </label>
          </div>

          <div className="paper-signoff-column">
            <label className="paper-line-field">Dispatched by:
              <input disabled={locked} value={waybill.dispatchedBy} onChange={(event) => patch({ dispatchedBy: event.target.value })} />
            </label>
            {locked ? (
              <div className="paper-readonly-signature"><span>Signature:</span>{waybill.dispatchedSignature && <img src={waybill.dispatchedSignature} alt="Dispatch signature" />}</div>
            ) : (
              <SignaturePad label="Signature:" value={waybill.dispatchedSignature} onChange={(value) => patch({ dispatchedSignature: value })} hint="Sign on the line" />
            )}
            <div className="paper-static-line"><span>Date:</span><b>{waybill.documentDate}</b></div>

            <p className="paper-certification">I certify that I have received the above items.</p>
            <label className="paper-line-field">Received by:
              <input disabled={locked} value={waybill.receivedBy} onChange={(event) => patch({ receivedBy: event.target.value })} />
            </label>
            {locked ? (
              <div className="paper-readonly-signature"><span>Signature:</span>{waybill.customerSignature && <img src={waybill.customerSignature} alt="Received signature" />}</div>
            ) : (
              <SignaturePad label="Signature:" value={waybill.customerSignature} onChange={(value) => patch({ customerSignature: value })} hint="Sign on the line" />
            )}
            <div className="paper-static-line"><span>Date:</span><b>{waybill.documentDate}</b></div>
          </div>
        </div>
      </section>

      {!locked && (
        <details className="paper-digital-proof">
          <summary>Digital proof <span>optional</span></summary>
          <div className="paper-digital-proof-body">
            <div className="paper-proof-row">
              <div><b>Location</b><small>{waybill.latitude != null && waybill.longitude != null ? "Captured" : "Not captured"}</small></div>
              <button type="button" onClick={captureGps} disabled={gpsBusy}>{gpsBusy ? "Locating…" : "Capture GPS"}</button>
            </div>
            <div className="paper-proof-row">
              <div><b>Delivery photo</b><small>{waybill.photo ? "Photo saved" : "No photo"}</small></div>
              <label className="paper-photo-button">{waybill.photo ? "Retake" : "Add photo"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
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
            </div>
          </div>
        </details>
      )}

      {!locked && (
        <div className="paper-waybill-actions">
          {waybillId && <button type="button" className="paper-delete-link" onClick={removeDraft}>Delete draft</button>}
          <button type="button" className="sales-secondary-button" onClick={saveDraft} disabled={Boolean(busy)}>{busy === "save" ? "Saving…" : "Save draft"}</button>
          <button type="button" className="sales-primary-button" onClick={complete} disabled={Boolean(busy)}>{busy === "complete" ? "Completing…" : "Complete waybill"}</button>
        </div>
      )}

      {locked && waybill.syncStatus === "synced" && waybill.verificationToken && (
        <Link href={`/verify/${waybill.verificationToken}`} className="sales-primary-button sales-verify-link">Verify this waybill</Link>
      )}
    </div>
  );
}
