import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyWaybill, createWaybillNumber, firstFilledItem, normalizeItems, summarizeWaybills, validateWaybill } from "../model.js";

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
  assert.deepEqual(Object.keys(errors), ["customerName", "deliveryAddress", "productName", "quantity", "driverName", "vehicleNumber", "customerSignature"]);
});

test("description lines supply product and quantity for completion", () => {
  const item = {
    ...createEmptyWaybill(new Date(), () => 0),
    customerName: "Customer Ltd",
    deliveryAddress: "Tema",
    productName: "",
    quantity: "",
    items: [{ description: "Fortifer Organic Fertilizer 50kg", qty: "20", remarks: "" }],
    driverName: "Driver One",
    vehicleNumber: "GT 100-26",
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
    driverName: "Driver One",
    vehicleNumber: "GT 100-26",
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

