import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyWaybill, createWaybillNumber, summarizeWaybills, validateWaybill } from "../model.js";

test("creates stable SafiRoute waybill number format", () => {
  assert.equal(createWaybillNumber(new Date("2026-09-15T10:00:00Z"), () => 0), "SR-20260915-1000");
});

test("new waybill starts as a local draft", () => {
  const item = createEmptyWaybill(new Date("2026-09-15T10:00:00Z"), () => 0);
  assert.equal(item.status, "draft");
  assert.equal(item.syncStatus, "local_only");
  assert.equal(item.unit, "Bags");
});

test("completion validation requires delivery evidence", () => {
  const errors = validateWaybill(createEmptyWaybill(new Date(), () => 0));
  assert.deepEqual(Object.keys(errors), ["customerName", "deliveryAddress", "productName", "quantity", "driverName", "vehicleNumber", "customerSignature"]);
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

