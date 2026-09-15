import test from "node:test";
import assert from "node:assert/strict";
import { buildBackup, createEmptyWaybill, createWaybillNumber, firstFilledItem, isMeaningfulDraft, mergeWaybills, normalizeItems, parseBackup, summarizeWaybills, validateWaybill } from "../model.js";

test("creates stable SafiRoute waybill number format", () => {
  assert.equal(createWaybillNumber(new Date("2026-09-15T10:00:00Z"), () => 0), "SR-20260915-1000");
});

test("new waybill starts as a local draft", () => {
  const item = createEmptyWaybill(new Date("2026-09-15T10:00:00Z"), () => 0);
  assert.equal(item.status, "draft");
  assert.equal(item.syncStatus, "local_only");
  assert.equal(item.unit, "Bags");
  assert.equal(item.authorisedSignature, null);
  assert.equal(item.dispatchedSignature, null);
});

test("completion validation requires delivery evidence", () => {
  const errors = validateWaybill(createEmptyWaybill(new Date(), () => 0));
  assert.deepEqual(Object.keys(errors), [
    "customerName",
    "deliveryAddress",
    "productName",
    "quantity",
    "authorisedBy",
    "driverName",
    "vehicleNumber",
    "receivedBy",
    "authorisedSignature",
    "dispatchedSignature",
    "customerSignature"
  ]);
});

test("description lines supply product and quantity for completion", () => {
  const item = {
    ...createEmptyWaybill(new Date(), () => 0),
    customerName: "Customer Ltd",
    deliveryAddress: "Tema",
    productName: "",
    quantity: "",
    items: [{ description: "Fortifer Organic Fertilizer 50kg", qty: "20", remarks: "" }],
    authorisedBy: "Ama Boateng",
    driverName: "Driver One",
    vehicleNumber: "GT 100-26",
    receivedBy: "Kojo Mensah",
    authorisedSignature: "data:image/png;base64,auth",
    dispatchedSignature: "data:image/png;base64,disp",
    customerSignature: "data:image/png;base64,test"
  };
  assert.deepEqual(validateWaybill(item), {});
  assert.equal(firstFilledItem(item).description, "Fortifer Organic Fertilizer 50kg");
});

test("older drafts without items hydrate the description table", () => {
  const items = normalizeItems({ productName: "Organic fertiliser", quantity: "12" });
  assert.equal(items[0].description, "Organic fertiliser");
  assert.equal(items[0].qty, "12");
  assert.equal(items.length, 5);
});

test("valid completed data passes validation", () => {
  const item = {
    ...createEmptyWaybill(new Date(), () => 0),
    customerName: "Customer Ltd",
    deliveryAddress: "Tema",
    productName: "Organic fertiliser",
    quantity: "20",
    authorisedBy: "Ama Boateng",
    driverName: "Driver One",
    vehicleNumber: "GT 100-26",
    receivedBy: "Kojo Mensah",
    authorisedSignature: "data:image/png;base64,auth",
    dispatchedSignature: "data:image/png;base64,disp",
    customerSignature: "data:image/png;base64,test"
  };
  assert.deepEqual(validateWaybill(item), {});
});

test("summarizes local and pending records", () => {
  const summary = summarizeWaybills([
    { status: "draft", syncStatus: "local_only" },
    { status: "completed", syncStatus: "pending" }
  ]);
  assert.deepEqual(summary, { total: 2, drafts: 1, completed: 1, pending: 1 });
});

test("prefilled sales name does not count as a real draft", () => {
  const waybill = createEmptyWaybill(new Date(), () => 0);
  waybill.authorisedBy = "Ama Boateng";
  waybill.vehicleNumber = "GT 100-26";
  waybill.authorisedSignature = "data:image/png;base64,saved";
  const profile = { operatorName: "Ama Boateng", vehicleNumber: "GT 100-26", authorisedSignature: "data:image/png;base64,saved" };
  assert.equal(isMeaningfulDraft(waybill, profile), false);
  waybill.customerName = "Tema Market";
  assert.equal(isMeaningfulDraft(waybill, profile), true);
});

test("backup files merge by id and keep the newer sheet", () => {
  const backup = parseBackup(JSON.stringify(buildBackup({
    profile: { operatorName: "Ama Boateng" },
    waybills: [{ id: "a", updatedAt: "2026-09-15T12:00:00.000Z", number: "SR-1" }]
  })));
  assert.equal(backup.profile.operatorName, "Ama Boateng");
  const merged = mergeWaybills(
    [{ id: "a", updatedAt: "2026-09-15T10:00:00.000Z", number: "old" }],
    backup.waybills
  );
  assert.equal(merged.updated, 1);
  assert.equal(merged.waybills[0].number, "SR-1");
});

