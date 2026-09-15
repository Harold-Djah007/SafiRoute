import { applyProfileDefaults, buildBackup, copyAsNew, createEmptyWaybill, firstFilledItem, gpsErrorMessage, isMeaningfulDraft, mergeWaybills, normalizeItems, parseBackup, summarizeWaybills, validateWaybill } from "./model.js";
import { deleteWaybill, getProfile, getWaybill, hashPin, listWaybills, saveProfile, saveWaybill, saveWaybills } from "./storage.js";

const state = { active: null, persisted: false };
const SESSION = "safiroute.session";
const dialog = document.querySelector("#waybillDialog");
const form = document.querySelector("#waybillForm");
const photoPreview = document.querySelector("#photoPreview");
let autosaveTimer = null;
let profile = null;
let listFilter = "all";
let listQuery = "";
let installPrompt = null;
let lastFocus = null;
let gpsBusy = false;
const pads = {};

function $(selector) { return document.querySelector(selector); }
function field(name) { return form.elements.namedItem(name); }

const PAD_FIELDS = [
  "customerName",
  "contactName",
  "customerPhone",
  "deliveryAddress",
  "documentDate",
  "authorisedBy",
  "authorisedRemarks",
  "driverName",
  "vehicleNumber",
  "receivedBy"
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function applyProfile(waybill) {
  return applyProfileDefaults(waybill, profile);
}

function initials(name) {
  return (name || "S").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function showSettingsNotice(id, message) {
  const notice = $(id);
  if (!notice) return;
  notice.textContent = message;
  notice.hidden = false;
}

function renderChrome() {
  if (!profile) return;
  $("#headerOperator").textContent = profile.operatorName;
  $("#greeting").textContent = `${greeting()}, ${profile.operatorName.split(" ")[0]}`;
  $("#homeTitle").textContent = "Compost waybills";
  $("#homeSubtitle").textContent = "Sales pad on this phone — no login required";
  $("#lockName").textContent = profile.operatorName;
  $("#lockRole").textContent = "Sales";
  const needsPin = Boolean(profile.pinHash);
  $("#pinUnlockLabel").hidden = !needsPin;
  $("#unlockPin").required = needsPin;
  $("#logoutButton").hidden = !needsPin;
  $("#removePinButton").hidden = !needsPin;
  $("#pinStatus").textContent = needsPin
    ? "PIN is on. Lock the pad when you step away from this phone."
    : "No PIN. Anyone with this phone can open the pad.";
  const pinValue = $("#pinStatusValue");
  pinValue.textContent = needsPin ? "On" : "Off";
  pinValue.classList.toggle("is-on", needsPin);
  $("#settingsPinTitle").textContent = needsPin ? "Change PIN" : "Set PIN";
  $("#settingsName").value = profile.operatorName;
  $("#settingsPhone").value = profile.phone || "";
  $("#settingsVehicle").value = profile.vehicleNumber || "";
  $("#settingsNameValue").textContent = profile.operatorName;
  $("#settingsPhoneValue").textContent = profile.phone || "Not set";
  $("#settingsVehicleValue").textContent = profile.vehicleNumber || "Not set";
  const thumb = $("#settingsSignatureThumb");
  const signed = Boolean(profile.authorisedSignature);
  $("#settingsSignatureValue").textContent = signed ? "Saved" : "Not saved";
  if (signed) {
    thumb.src = profile.authorisedSignature;
    thumb.hidden = false;
    thumb.alt = "Saved authorised-by mark";
  } else {
    thumb.removeAttribute("src");
    thumb.hidden = true;
    thumb.alt = "";
  }
  $("#settingsHeroName").textContent = profile.operatorName;
  $("#settingsHeroMeta").textContent = profile.phone || "Name used on Authorised by";
  $("#settingsAvatar").textContent = initials(profile.operatorName);
  if (pads.sales) pads.sales.load(profile.authorisedSignature);
  $("#backupMeta").textContent = profile.lastBackupAt
    ? `Last backup ${formatDate(profile.lastBackupAt)}`
    : "Waybills live only in this browser";
}

function closeSettingsEditors(root) {
  root.querySelectorAll("details.settings-disclose").forEach((block) => {
    block.open = false;
  });
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function showGate(name) {
  $("#setupScreen").hidden = name !== "setup";
  $("#lockScreen").hidden = name !== "lock";
  $("#appShell").hidden = name !== "app";
  document.body.dataset.stage = name;
}

function unlockSession() {
  sessionStorage.setItem(SESSION, "open");
}

function lockSession() {
  sessionStorage.removeItem(SESSION);
}

async function enterApp() {
  unlockSession();
  showGate("app");
  renderChrome();
  setView("waybills", { instant: true });
  await refreshList();
}

function applyView(name) {
  $("#waybillsView").hidden = name !== "waybills";
  $("#settingsView").hidden = name !== "settings";
  document.querySelectorAll(".nav-btn").forEach((button) => {
    const on = button.dataset.view === name;
    button.classList.toggle("active", on);
    if (on) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function currentView() {
  return $("#settingsView")?.hidden === false ? "settings" : "waybills";
}

function setView(name, { instant = false } = {}) {
  const from = currentView();
  if (from === name) {
    applyView(name);
    return;
  }
  const dir = name === "settings" ? "forward" : "back";
  document.documentElement.dataset.dir = dir;
  if (instant || prefersReducedMotion()) {
    applyView(name);
    return;
  }
  if (typeof document.startViewTransition === "function") {
    const outgoing = from === "settings" ? $("#settingsView") : $("#waybillsView");
    const incoming = name === "settings" ? $("#settingsView") : $("#waybillsView");
    outgoing.style.viewTransitionName = "page";
    const transition = document.startViewTransition(() => {
      outgoing.style.viewTransitionName = "";
      incoming.style.viewTransitionName = "page";
      applyView(name);
    });
    transition.finished.finally(() => {
      incoming.style.viewTransitionName = "";
    });
    return;
  }
  const outgoing = from === "settings" ? $("#settingsView") : $("#waybillsView");
  const incoming = name === "settings" ? $("#settingsView") : $("#waybillsView");
  outgoing.classList.add(`leave-${dir}`);
  outgoing.addEventListener("animationend", () => {
    outgoing.classList.remove(`leave-${dir}`);
    applyView(name);
    incoming.classList.add(`enter-${dir}`);
    incoming.addEventListener("animationend", () => incoming.classList.remove(`enter-${dir}`), { once: true });
  }, { once: true });
}

function cubicPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
  };
}

function routePoint(t) {
  const start = { x: 0.075, y: 0.80 };
  const mid = { x: 0.433, y: 0.475 };
  const end = { x: 0.917, y: 0.20 };
  if (t < 0.48) {
    return cubicPoint(start, { x: 0.20, y: 0.75 }, { x: 0.233, y: 0.525 }, mid, t / 0.48);
  }
  return cubicPoint(mid, { x: 0.633, y: 0.425 }, { x: 0.717, y: 0.375 }, end, (t - 0.48) / 0.52);
}

function startAtmosphere() {
  const canvas = $("#atmosphereCanvas");
  if (!canvas || prefersReducedMotion()) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const sheets = [
    { x: 0.11, y: 0.68, w: 86, h: 112, rot: -0.16, bob: 0.8, a: 0.26 },
    { x: 0.89, y: 0.54, w: 74, h: 96, rot: 0.12, bob: 1.4, a: 0.22 },
    { x: 0.84, y: 0.16, w: 68, h: 88, rot: -0.08, bob: 2.1, a: 0.2 },
    { x: 0.14, y: 0.24, w: 70, h: 92, rot: 0.18, bob: 1.1, a: 0.18 }
  ];
  const checks = [
    { t: 0.08, speed: 0.00011 },
    { t: 0.42, speed: 0.00009 },
    { t: 0.76, speed: 0.00013 }
  ];
  const courier = { t: 0.2 };

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
  };

  const drawSheet = (sheet, w, h, scale, now) => {
    const lift = Math.sin(now * 0.0007 + sheet.bob) * 10 * scale;
    ctx.save();
    ctx.translate(sheet.x * w, sheet.y * h + lift);
    ctx.rotate(sheet.rot + Math.sin(now * 0.0004 + sheet.bob) * 0.04);
    ctx.globalAlpha = sheet.a;
    const sw = sheet.w * scale;
    const sh = sheet.h * scale;
    ctx.fillStyle = "#f6f1e4";
    ctx.strokeStyle = "rgba(200, 185, 146, 0.7)";
    ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-sw / 2, -sh / 2, sw, sh, 4 * scale);
    else ctx.rect(-sw / 2, -sh / 2, sw, sh);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffc318";
    ctx.fillRect(-sw / 2, -sh / 2, sw, sh * 0.18);
    ctx.fillStyle = "#075b38";
    ctx.font = `700 ${Math.max(8, sh * 0.1)}px "Iowan Old Style", Palatino, Georgia, serif`;
    ctx.fillText("No.", -sw / 2 + 8 * scale, -sh / 2 + sh * 0.13);
    ctx.setLineDash([3 * scale, 4 * scale]);
    ctx.strokeStyle = "rgba(154, 175, 156, 0.85)";
    ctx.lineWidth = 1 * scale;
    for (let i = 0; i < 3; i += 1) {
      const ly = -sh / 2 + sh * 0.38 + i * sh * 0.18;
      const endX = i === 2 ? sw * 0.12 : sw / 2 - 8 * scale;
      ctx.beginPath();
      ctx.moveTo(-sw / 2 + 8 * scale, ly);
      ctx.lineTo(endX, ly);
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawCheck = (point, size, alpha) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#83c900";
    ctx.beginPath();
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f6f1e4";
    ctx.lineWidth = Math.max(1.4, size * 0.28);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(point.x - size * 0.38, point.y + size * 0.04);
    ctx.lineTo(point.x - size * 0.08, point.y + size * 0.32);
    ctx.lineTo(point.x + size * 0.4, point.y - size * 0.28);
    ctx.stroke();
    ctx.restore();
  };

  const tick = (now) => {
    const { width: w, height: h } = canvas;
    const scale = w / window.innerWidth;
    ctx.clearRect(0, 0, w, h);

    for (const sheet of sheets) drawSheet(sheet, w, h, scale, now);

    courier.t = (courier.t + 0.00008) % 1;
    const bead = routePoint(courier.t);
    ctx.save();
    ctx.fillStyle = "rgba(255, 195, 24, 0.88)";
    ctx.strokeStyle = "rgba(246, 241, 228, 0.9)";
    ctx.lineWidth = 1.4 * scale;
    ctx.beginPath();
    ctx.arc(bead.x * w, bead.y * h, 4.4 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    for (const mote of checks) {
      mote.t += mote.speed;
      if (mote.t > 1.08) mote.t = -0.06;
      const point = routePoint(Math.max(0, Math.min(1, mote.t)));
      const px = { x: point.x * w, y: point.y * h };
      const fade = mote.t < 0.08 ? mote.t / 0.08 : mote.t > 0.9 ? Math.max(0, (1.05 - mote.t) / 0.15) : 1;
      drawCheck(px, 7.5 * scale, 0.72 * fade);
    }

    requestAnimationFrame(tick);
  };

  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(tick);
}

function setConnectionStatus() {
  const online = navigator.onLine;
  const badge = $("#connectionBadge");
  if (!badge) return;
  badge.textContent = online ? "● Online" : "● Offline — device saving active";
  badge.classList.toggle("offline", !online);
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function readItems() {
  return [...document.querySelectorAll("#itemRows tr")].map((row) => ({
    description: row.querySelector('[data-item="description"]').value.trim(),
    qty: row.querySelector('[data-item="qty"]').value,
    remarks: row.querySelector('[data-item="remarks"]').value.trim()
  }));
}

function renderItems(items, completed = false) {
  const body = $("#itemRows");
  const template = $("#itemRowTemplate");
  body.replaceChildren();
  items.forEach((item, index) => {
    const row = template.content.cloneNode(true);
    const description = row.querySelector('[data-item="description"]');
    description.value = item.description || "";
    if (index === 0) description.placeholder = "e.g. Fortifer Organic Fertilizer 50kg";
    row.querySelector('[data-item="qty"]').value = item.qty || "";
    row.querySelector('[data-item="remarks"]').value = item.remarks || "";
    body.append(row);
  });
  body.querySelectorAll("input").forEach((element) => { element.disabled = completed; });
}

function addItemRow() {
  if (state.active?.status === "completed") return;
  const row = $("#itemRowTemplate").content.cloneNode(true);
  $("#itemRows").append(row);
  const description = $("#itemRows tr:last-child [data-item='description']");
  description?.focus();
  scheduleAutosave();
}

function readForm() {
  const now = new Date().toISOString();
  const items = readItems();
  const waybill = {
    ...state.active,
    customerName: field("customerName").value.trim(),
    contactName: field("contactName").value.trim(),
    customerPhone: field("customerPhone").value.trim(),
    deliveryAddress: field("deliveryAddress").value.trim(),
    documentDate: field("documentDate").value,
    authorisedBy: field("authorisedBy").value.trim(),
    authorisedRemarks: field("authorisedRemarks").value.trim(),
    driverName: field("driverName").value.trim(),
    vehicleNumber: field("vehicleNumber").value.trim().toUpperCase(),
    receivedBy: field("receivedBy").value.trim(),
    items,
    authorisedSignature: pads.authorised.read(),
    dispatchedSignature: pads.dispatched.read(),
    customerSignature: pads.customer.read(),
    updatedAt: now
  };
  const line = firstFilledItem(waybill);
  waybill.productName = line?.description?.trim() || "";
  waybill.quantity = line?.qty || "";
  return waybill;
}

function populateForm(waybill, persisted = false) {
  state.active = waybill;
  state.persisted = persisted;
  form.reset();
  for (const name of PAD_FIELDS) {
    field(name).value = waybill[name] ?? "";
  }
  renderItems(normalizeItems(waybill), waybill.status === "completed");
  $("#dialogTitle").textContent = waybill.status === "completed" ? "Completed delivery" : waybill.createdAt === waybill.updatedAt ? "New waybill" : "Edit waybill";
  $("#waybillNumber").textContent = waybill.number;
  const completed = waybill.status === "completed";
  form.querySelectorAll("input, textarea, select").forEach((element) => { element.disabled = completed; });
  $("#gpsButton").hidden = completed;
  $("#addLineButton").hidden = completed;
  pads.authorised.load(waybill.authorisedSignature);
  pads.dispatched.load(waybill.dispatchedSignature);
  pads.customer.load(waybill.customerSignature);
  pads.authorised.setEnabled(!completed);
  pads.dispatched.setEnabled(!completed);
  pads.customer.setEnabled(!completed);
  $("#saveDraftButton").hidden = completed;
  $("#completeButton").hidden = completed;
  $("#deleteButton").hidden = !persisted || completed;
  const gpsStatus = $("#gpsStatus");
  gpsStatus.classList.remove("gps-status-error");
  gpsStatus.textContent = locationLabel(waybill);
  photoPreview.hidden = !waybill.photo;
  if (waybill.photo) photoPreview.src = waybill.photo;
  clearErrors();
  showNotice(waybill.status === "completed" ? "This compost sale is stored on this phone until server sync is connected." : "Fill the sale, then Sales, Dispatch, and the customer sign. Changes save on this phone.");
}

function showNotice(message) {
  const notice = $("#formNotice");
  notice.textContent = message;
  notice.hidden = false;
}

function clearErrors() {
  form.querySelectorAll(".invalid").forEach((element) => element.classList.remove("invalid"));
}

function errorTarget(name) {
  if (name === "productName") return document.querySelector('[data-item="description"]');
  if (name === "quantity") return document.querySelector('[data-item="qty"]');
  if (name === "authorisedSignature") return document.querySelector('[data-sign="authorised"]');
  if (name === "dispatchedSignature") return document.querySelector('[data-sign="dispatched"]');
  if (name === "customerSignature") return document.querySelector('[data-sign="received"]');
  return field(name);
}

function showErrors(errors) {
  clearErrors();
  const firstName = Object.keys(errors)[0];
  for (const name of Object.keys(errors)) {
    errorTarget(name)?.classList.add("invalid");
  }
  showNotice(Object.values(errors).join(" "));
  errorTarget(firstName)?.focus();
}

async function persist(status) {
  clearTimeout(autosaveTimer);
  const waybill = readForm();
  if (status === "draft" && !isMeaningfulDraft(waybill, profile || {})) {
    return showNotice("Nothing to save yet. Fill the customer or a product line first.");
  }
  if (status === "completed") {
    const errors = validateWaybill(waybill);
    if (Object.keys(errors).length) return showErrors(errors);
    const missingProof = waybill.latitude == null && !waybill.photo;
    const who = waybill.customerName || "this customer";
    const ok = confirm(missingProof
      ? `Complete ${waybill.number} for ${who} without GPS or a photo?\n\nThe pad becomes read-only on this phone. Server sync is not connected yet.`
      : `Complete ${waybill.number} for ${who}?\n\nSales, Dispatch, and the customer have signed. This pad becomes read-only on this phone until server sync is connected.`);
    if (!ok) return;
  }
  waybill.status = status;
  waybill.syncStatus = status === "completed" ? "pending" : "local_only";
  await saveWaybill(waybill);
  state.active = waybill;
  dialog.close();
  await refreshList();
}

function locationLabel(waybill) {
  if (waybill?.latitude == null) return "No location captured";
  return `${waybill.latitude.toFixed(5)}, ${waybill.longitude.toFixed(5)} (±${Math.round(waybill.gpsAccuracy || 0)} m)`;
}

function compressPhoto(file) {
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
        reject(new Error("Could not compress that photo."));
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const quality = file.size > 1_200_000 ? 0.7 : 0.82;
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that photo. Try a JPEG or PNG."));
    };
    image.src = url;
  });
}

function openPad(waybill, persisted = false) {
  lastFocus = document.activeElement;
  populateForm(waybill, persisted);
  dialog.showModal();
  const target = field("customerName");
  if (target && !target.disabled) target.focus();
}

async function autosaveDraft({ ignoreOpen = false } = {}) {
  if (!state.active || state.active.status === "completed") return;
  if (!dialog.open && !ignoreOpen) return;
  const waybill = readForm();
  if (!isMeaningfulDraft(waybill, profile || {})) return;
  waybill.status = "draft";
  waybill.syncStatus = "local_only";
  await saveWaybill(waybill);
  state.active = waybill;
  state.persisted = true;
  $("#deleteButton").hidden = false;
  showNotice(`Saved on this device at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
  await refreshList();
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => autosaveDraft().catch((error) => showNotice(`Device save failed: ${error.message}`)), 600);
}

function attachPad(canvas, { lineWidth = 3, autosave = true } = {}) {
  const ctx = canvas.getContext("2d");
  const shell = canvas.closest(".sign-line");
  let drawing = false;
  let dirty = false;
  let present = false;
  let stored = null;

  function style() {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = "#1a3a28";
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function clear(markDirty = false) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    style();
    dirty = markDirty;
    present = false;
    if (markDirty) stored = null;
    shell.classList.remove("is-signed", "is-signing");
  }

  function load(dataUrl) {
    stored = dataUrl || null;
    dirty = false;
    present = Boolean(dataUrl);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    style();
    shell.classList.toggle("is-signed", present);
    shell.classList.remove("is-signing");
    if (!dataUrl) return;
    const image = new Image();
    image.onload = () => {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      present = true;
      shell.classList.add("is-signed");
    };
    image.src = dataUrl;
  }

  function read() {
    if (dirty) return present ? canvas.toDataURL("image/png") : null;
    return stored;
  }

  function setEnabled(enabled) {
    canvas.style.pointerEvents = enabled ? "" : "none";
    const clearBtn = shell.querySelector("[data-clear-sign]");
    if (clearBtn) clearBtn.hidden = !enabled;
  }

  canvas.addEventListener("pointerdown", (event) => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    shell.classList.add("is-signing");
    const start = point(event);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const next = point(event);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    dirty = true;
    present = true;
    shell.classList.add("is-signed");
  });
  canvas.addEventListener("pointerup", () => {
    drawing = false;
    shell.classList.remove("is-signing");
    if (autosave) scheduleAutosave();
  });
  canvas.addEventListener("pointercancel", () => {
    drawing = false;
    shell.classList.remove("is-signing");
  });
  shell.querySelector("[data-clear-sign]")?.addEventListener("click", () => {
    clear(true);
    if (autosave) scheduleAutosave();
  });
  style();

  return { clear, load, read, setEnabled };
}

Object.assign(pads, {
  authorised: attachPad($("#authorisedSignature"), { lineWidth: 2.6 }),
  dispatched: attachPad($("#dispatchedSignature"), { lineWidth: 2.6 }),
  customer: attachPad($("#signatureCanvas"), { lineWidth: 2.6 }),
  sales: attachPad($("#salesSignature"), { lineWidth: 2.6, autosave: false })
});

function productSummary(item) {
  const line = firstFilledItem(item);
  const description = line?.description || item.productName;
  const qty = line?.qty || item.quantity;
  if (!description) return "Not entered";
  return qty ? `${description} · ${qty}` : description;
}

async function refreshList() {
  const items = await listWaybills();
  const summary = summarizeWaybills(items);
  $("#totalCount").textContent = summary.total;
  $("#draftCount").textContent = summary.drafts;
  $("#completedCount").textContent = summary.completed;
  $("#pendingCount").textContent = summary.pending;
  const visible = items.filter((item) => {
    if (listFilter !== "all" && item.status !== listFilter) return false;
    if (!listQuery) return true;
    const haystack = [item.number, item.customerName, item.contactName, item.vehicleNumber, productSummary(item)].join(" ").toLowerCase();
    return haystack.includes(listQuery);
  });
  $("#emptyState").hidden = visible.length > 0;
  $("#emptyState h3").textContent = items.length ? "Nothing in this filter" : "No waybills yet";
  $("#emptyState p").textContent = items.length
    ? (listQuery ? "No waybill matches that search." : "Try All to see every pad on this phone.")
    : "Open a pad when a customer comes to buy compost. Sales, Dispatch, and the customer sign on this sheet.";
  $("#deviceStats").textContent = `${summary.total} waybill${summary.total === 1 ? "" : "s"}`;
  const list = $("#waybillList");
  list.replaceChildren();
  visible.forEach((item, index) => {
    const card = $("#waybillTemplate").content.cloneNode(true);
    card.querySelector(".waybill-card").style.setProperty("--i", String(index));
    card.querySelector('[data-field="number"]').textContent = item.number;
    card.querySelector('[data-field="customerName"]').textContent = item.customerName || "Deliver to not entered";
    const status = card.querySelector('[data-field="status"]');
    status.textContent = item.status;
    status.classList.toggle("draft", item.status === "draft");
    card.querySelector('[data-field="product"]').textContent = productSummary(item);
    card.querySelector('[data-field="vehicle"]').textContent = item.vehicleNumber || "Not assigned";
    card.querySelector('[data-field="updated"]').textContent = formatDate(item.updatedAt);
    card.querySelector('[data-field="sync"]').textContent = item.syncStatus === "pending" ? "Pending server" : "Device only";
    card.querySelector("[data-open]").addEventListener("click", async () => {
      openPad(await getWaybill(item.id), true);
    });
    card.querySelector("[data-copy]").addEventListener("click", async () => {
      openPad(copyAsNew(await getWaybill(item.id), profile || {}));
    });
    list.append(card);
  });
}

$("#newWaybillButton").addEventListener("click", () => {
  openPad(applyProfile(createEmptyWaybill()));
});
$("#closeDialogButton").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => {
  const restore = lastFocus;
  autosaveDraft({ ignoreOpen: true }).catch((error) => console.error(error)).finally(() => {
    restore?.focus?.();
  });
});
$("#addLineButton").addEventListener("click", addItemRow);
$("#saveDraftButton").addEventListener("click", () => persist("draft"));
$("#completeButton").addEventListener("click", () => persist("completed"));
$("#printButton").addEventListener("click", () => window.print());
$("#copyWaybillButton").addEventListener("click", async () => {
  if (!state.active) return;
  clearTimeout(autosaveTimer);
  const source = readForm();
  const copied = isMeaningfulDraft(source, profile || {});
  if (state.persisted && source.status !== "completed" && copied) {
    source.status = "draft";
    source.syncStatus = "local_only";
    await saveWaybill(source);
  }
  populateForm(copyAsNew(source, profile || {}));
  field("customerName")?.focus();
  showNotice(copied
    ? "This is a new pad with a new number. The original stays on this phone."
    : "Nothing to copy yet. This is a fresh pad.");
});
$("#deleteButton").addEventListener("click", async () => {
  if (!confirm(`Delete ${state.active.number} from this device?`)) return;
  await deleteWaybill(state.active.id);
  state.active = null;
  state.persisted = false;
  dialog.close();
  await refreshList();
});

$("#gpsButton").addEventListener("click", () => {
  if (!navigator.geolocation) return showNotice("GPS is not available on this device. You can still complete the pad without it.");
  if (gpsBusy) return;
  gpsBusy = true;
  const status = $("#gpsStatus");
  status.classList.remove("gps-status-error");
  status.textContent = "Capturing location…";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      gpsBusy = false;
      state.active.latitude = position.coords.latitude;
      state.active.longitude = position.coords.longitude;
      state.active.gpsAccuracy = position.coords.accuracy;
      state.active.gpsCapturedAt = new Date(position.timestamp).toISOString();
      status.textContent = locationLabel(state.active);
      scheduleAutosave();
    },
    (error) => {
      gpsBusy = false;
      status.classList.add("gps-status-error");
      status.textContent = state.active?.latitude == null ? "No location captured" : locationLabel(state.active);
      showNotice(gpsErrorMessage(error));
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
});

$("#photoInput").addEventListener("change", async (event) => {
  const input = event.target;
  const [file] = input.files;
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    input.value = "";
    return showNotice("That photo is over 20 MB. Try a smaller camera shot.");
  }
  showNotice("Compressing photo for this phone…");
  try {
    const dataUrl = await compressPhoto(file);
    state.active.photo = dataUrl;
    photoPreview.src = dataUrl;
    photoPreview.hidden = false;
    showNotice("Photo saved on this phone.");
    scheduleAutosave();
  } catch (error) {
    showNotice(error.message);
  } finally {
    input.value = "";
  }
});

$("#exportButton").addEventListener("click", async () => {
  const exportedAt = new Date().toISOString();
  const payload = buildBackup({ profile, waybills: await listWaybills(), exportedAt });
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `safiroute-backup-${exportedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  profile = { ...profile, lastBackupAt: exportedAt, updatedAt: exportedAt };
  await saveProfile(profile);
  renderChrome();
  showSettingsNotice("#dataNotice", "Backup file saved. Keep it off this phone.");
});

$("#importButton").addEventListener("click", () => $("#importBackup").click());
$("#importBackup").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;
  try {
    const backup = parseBackup(await file.text());
    const merged = mergeWaybills(await listWaybills(), backup.waybills);
    await saveWaybills(merged.waybills);
    if (backup.profile && confirm("This file has a sales profile. Restore name, phone, vehicle, and signature on this phone?")) {
      profile = {
        ...profile,
        operatorName: backup.profile.operatorName || profile.operatorName,
        phone: backup.profile.phone || profile.phone || "",
        vehicleNumber: backup.profile.vehicleNumber || profile.vehicleNumber || "",
        authorisedSignature: backup.profile.authorisedSignature || profile.authorisedSignature || null,
        pinHash: backup.profile.pinHash || profile.pinHash || null,
        role: "sales",
        updatedAt: new Date().toISOString()
      };
      await saveProfile(profile);
    }
    renderChrome();
    await refreshList();
    showSettingsNotice("#dataNotice", `Restored ${merged.added} new, ${merged.updated} updated, ${merged.skipped} unchanged.`);
  } catch (error) {
    showSettingsNotice("#dataNotice", error.message);
  }
});

form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("input", scheduleAutosave);
window.addEventListener("online", setConnectionStatus);
window.addEventListener("offline", setConnectionStatus);

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});
document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", async () => {
    listFilter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((chip) => {
      const on = chip === button;
      chip.classList.toggle("active", on);
      chip.setAttribute("aria-pressed", on ? "true" : "false");
    });
    await refreshList();
  });
});
$("#waybillSearch").addEventListener("input", async (event) => {
  listQuery = event.target.value.trim().toLowerCase();
  await refreshList();
});

document.querySelectorAll("#settingsView details.settings-disclose").forEach((block) => {
  block.addEventListener("toggle", () => {
    if (!block.open) return;
    document.querySelectorAll("#settingsView details.settings-disclose").forEach((other) => {
      if (other !== block) other.open = false;
    });
    block.querySelector("input, canvas")?.focus();
  });
});

$("#setupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  profile = {
    id: "profile",
    operatorName: $("#setupName").value.trim(),
    role: "sales",
    phone: "",
    vehicleNumber: "",
    authorisedSignature: null,
    pinHash: null,
    lastBackupAt: null,
    updatedAt: new Date().toISOString()
  };
  await saveProfile(profile);
  await enterApp();
});

$("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  profile = {
    ...profile,
    operatorName: $("#settingsName").value.trim(),
    phone: $("#settingsPhone").value.trim(),
    vehicleNumber: $("#settingsVehicle").value.trim().toUpperCase(),
    authorisedSignature: pads.sales.read(),
    role: "sales",
    updatedAt: new Date().toISOString()
  };
  await saveProfile(profile);
  renderChrome();
  closeSettingsEditors($("#settingsForm"));
  showSettingsNotice("#settingsNotice", "Sales details saved on this phone.");
});

$("#pinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const pin = $("#settingsPin").value.trim();
  const confirmPin = $("#settingsPinConfirm").value.trim();
  if (!/^\d{4}$/.test(pin)) {
    $("#settingsPinDetails").open = true;
    $("#settingsPin")?.focus();
    return showSettingsNotice("#pinNotice", "Use a 4-digit PIN.");
  }
  if (pin !== confirmPin) {
    $("#settingsPinDetails").open = true;
    $("#settingsPinConfirm")?.focus();
    return showSettingsNotice("#pinNotice", "Those PINs do not match.");
  }
  profile = { ...profile, pinHash: await hashPin(pin), updatedAt: new Date().toISOString() };
  await saveProfile(profile);
  $("#settingsPin").value = "";
  $("#settingsPinConfirm").value = "";
  renderChrome();
  closeSettingsEditors($("#pinForm"));
  showSettingsNotice("#pinNotice", "PIN saved. Use Lock pad now when you step away.");
});

$("#removePinButton").addEventListener("click", async () => {
  if (!confirm("Remove the PIN from this phone?")) return;
  profile = { ...profile, pinHash: null, updatedAt: new Date().toISOString() };
  await saveProfile(profile);
  unlockSession();
  renderChrome();
  showSettingsNotice("#pinNotice", "PIN removed. The pad stays open on this phone.");
});

$("#logoutButton").addEventListener("click", () => {
  if (dialog.open) dialog.close();
  lockSession();
  $("#unlockPin").value = "";
  $("#lockError").hidden = true;
  renderChrome();
  showGate("lock");
});

$("#unlockForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = $("#lockError");
  error.hidden = true;
  if (profile.pinHash) {
    const ok = await hashPin($("#unlockPin").value.trim()) === profile.pinHash;
    if (!ok) {
      error.textContent = "That PIN does not match.";
      error.hidden = false;
      return;
    }
  }
  $("#unlockPin").value = "";
  await enterApp();
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  $("#installButton").hidden = false;
});
$("#installButton").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("#installButton").hidden = true;
});

setConnectionStatus();
startAtmosphere();
profile = await getProfile();
if (!profile?.operatorName) {
  showGate("setup");
} else if (profile.pinHash && sessionStorage.getItem(SESSION) !== "open") {
  renderChrome();
  showGate("lock");
} else {
  await enterApp();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((error) => console.error("Service worker registration failed", error));
}
