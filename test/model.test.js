import test from "node:test";
import assert from "node:assert/strict";
import { applyProfileDefaults, buildBackup, copyAsNew, createEmptyWaybill, createWaybillNumber, firstFilledItem, gpsErrorMessage, isMeaningfulDraft, mergeWaybills, normalizeItems, parseBackup, summarizeWaybills, validateWaybill } from "../model.js";

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

test("copy as new does not duplicate an empty profile-only pad", () => {
  const profile = { operatorName: "Ama Boateng", vehicleNumber: "GT 100-26", authorisedSignature: "data:image/png;base64,saved" };
  const empty = applyProfileDefaults(createEmptyWaybill(new Date("2026-09-15T10:00:00Z"), () => 0), profile);
  const copy = copyAsNew(empty, profile, new Date("2026-09-15T11:00:00Z"), () => 0.5);
  assert.equal(isMeaningfulDraft(copy, profile), false);
  assert.equal(copy.customerName, "");
  assert.notEqual(copy.id, empty.id);
  assert.equal(copy.authorisedBy, "Ama Boateng");
});

test("copy as new clones customer lines but not GPS, photo, or signatures", () => {
  const profile = { operatorName: "Ama Boateng", authorisedSignature: "data:image/png;base64,saved" };
  const source = {
    ...createEmptyWaybill(new Date("2026-09-15T10:00:00Z"), () => 0),
    customerName: "Tema Market",
    contactName: "Kojo",
    deliveryAddress: "Tema",
    items: [{ description: "Fortifer Organic Fertilizer 50kg", qty: "20", remarks: "50kg" }],
    productName: "Fortifer Organic Fertilizer 50kg",
    quantity: "20",
    driverName: "Yaw",
    vehicleNumber: "GT 100-26",
    receivedBy: "Ama Customer",
    authorisedSignature: "data:image/png;base64,auth",
    dispatchedSignature: "data:image/png;base64,disp",
    customerSignature: "data:image/png;base64,cust",
    photo: "data:image/jpeg;base64,photo",
    latitude: 5.6,
    longitude: -0.2
  };
  const copy = copyAsNew(source, profile, new Date("2026-09-15T12:00:00Z"), () => 0.4);
  assert.equal(copy.customerName, "Tema Market");
  assert.equal(copy.items[0].description, "Fortifer Organic Fertilizer 50kg");
  assert.equal(copy.driverName, "Yaw");
  assert.equal(copy.status, "draft");
  assert.equal(copy.photo, null);
  assert.equal(copy.latitude, null);
  assert.equal(copy.customerSignature, null);
  assert.equal(copy.dispatchedSignature, null);
  assert.equal(copy.authorisedSignature, "data:image/png;base64,saved");
  assert.notEqual(copy.number, source.number);
});

test("GPS errors explain permission, unavailability, and timeout", () => {
  assert.match(gpsErrorMessage({ code: 1 }), /permission/i);
  assert.match(gpsErrorMessage({ code: 2 }), /unavailable/i);
  assert.match(gpsErrorMessage({ code: 3 }), /timed out/i);
  assert.match(gpsErrorMessage({ message: "nope" }), /nope/);
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

