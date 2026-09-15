import { createEmptyWaybill, firstFilledItem, normalizeItems, summarizeWaybills, validateWaybill } from "./model.js";
import { deleteWaybill, getProfile, getWaybill, hashPin, listWaybills, saveProfile, saveWaybill } from "./storage.js";

const state = { active: null, persisted: false };
const SESSION = "safiroute.session";
const dialog = document.querySelector("#waybillDialog");
const form = document.querySelector("#waybillForm");
const photoPreview = document.querySelector("#photoPreview");
let autosaveTimer = null;
let profile = null;
let listFilter = "all";
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

function applyProfileDefaults(waybill) {
  if (!profile?.operatorName) return waybill;
  waybill.authorisedBy = profile.operatorName;
  return waybill;
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
  $("#settingsName").value = profile.operatorName;
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
    button.classList.toggle("active", button.dataset.view === name);
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
    document.startViewTransition(() => applyView(name));
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

function startAtmosphere() {
  const canvas = $("#atmosphereCanvas");
  if (!canvas || prefersReducedMotion()) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const particles = Array.from({ length: 46 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.7 + 0.35,
    s: Math.random() * 0.00032 + 0.0001,
    a: Math.random() * 0.42 + 0.12,
    gold: Math.random() > 0.42
  }));
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
  };
  const tick = () => {
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    for (const particle of particles) {
      particle.y -= particle.s;
      particle.x += Math.sin(particle.y * 14) * 0.00016;
      if (particle.y < -0.02) {
        particle.y = 1.02;
        particle.x = Math.random();
      }
      ctx.beginPath();
      ctx.fillStyle = particle.gold
        ? `rgba(255, 195, 24, ${particle.a})`
        : `rgba(210, 255, 176, ${particle.a * 0.72})`;
      ctx.arc(particle.x * w, particle.y * h, particle.r * (w / window.innerWidth), 0, Math.PI * 2);
      ctx.fill();
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
  $("#gpsStatus").textContent = waybill.latitude == null
    ? "No location captured"
    : `${waybill.latitude.toFixed(5)}, ${waybill.longitude.toFixed(5)} (±${Math.round(waybill.gpsAccuracy)} m)`;
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
  if (status === "completed") {
    const errors = validateWaybill(waybill);
    if (Object.keys(errors).length) return showErrors(errors);
  }
  waybill.status = status;
  waybill.syncStatus = status === "completed" ? "pending" : "local_only";
  await saveWaybill(waybill);
  state.active = waybill;
  dialog.close();
  await refreshList();
}

function hasDraftContent(waybill) {
  const lineFilled = (waybill.items || []).some((item) => item.description?.trim() || item.qty || item.remarks?.trim());
  return [
    waybill.customerName,
    waybill.contactName,
    waybill.customerPhone,
    waybill.deliveryAddress,
    waybill.authorisedBy,
    waybill.authorisedRemarks,
    waybill.driverName,
    waybill.vehicleNumber,
    waybill.receivedBy,
    waybill.authorisedSignature,
    waybill.dispatchedSignature,
    waybill.customerSignature,
    waybill.photo,
    waybill.latitude
  ].some((value) => value !== null && String(value).trim() !== "") || lineFilled;
}

async function autosaveDraft() {
  if (!dialog.open || state.active?.status === "completed") return;
  const waybill = readForm();
  if (!hasDraftContent(waybill)) return;
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

function attachPad(canvas, { lineWidth = 3 } = {}) {
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
    scheduleAutosave();
  });
  canvas.addEventListener("pointercancel", () => {
    drawing = false;
    shell.classList.remove("is-signing");
  });
  shell.querySelector("[data-clear-sign]")?.addEventListener("click", () => {
    clear(true);
    scheduleAutosave();
  });
  style();

  return { clear, load, read, setEnabled };
}

Object.assign(pads, {
  authorised: attachPad($("#authorisedSignature"), { lineWidth: 2.6 }),
  dispatched: attachPad($("#dispatchedSignature"), { lineWidth: 2.6 }),
  customer: attachPad($("#signatureCanvas"), { lineWidth: 2.6 })
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
  const visible = listFilter === "all" ? items : items.filter((item) => item.status === listFilter);
  $("#emptyState").hidden = visible.length > 0;
  $("#emptyState h3").textContent = items.length ? "Nothing in this filter" : "No waybills yet";
  $("#emptyState p").textContent = items.length ? "Try All to see every pad on this phone." : "Open a pad when a customer comes to buy compost. Sales, Dispatch, and the customer sign on this sheet.";
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
    card.querySelector(".card-action").addEventListener("click", async () => {
      populateForm(await getWaybill(item.id), true);
      dialog.showModal();
    });
    list.append(card);
  });
}

$("#newWaybillButton").addEventListener("click", () => {
  populateForm(applyProfileDefaults(createEmptyWaybill()));
  dialog.showModal();
});
$("#closeDialogButton").addEventListener("click", async () => {
  await autosaveDraft();
  dialog.close();
});
$("#addLineButton").addEventListener("click", addItemRow);
$("#saveDraftButton").addEventListener("click", () => persist("draft"));
$("#completeButton").addEventListener("click", () => persist("completed"));
$("#deleteButton").addEventListener("click", async () => {
  if (!confirm(`Delete ${state.active.number} from this device?`)) return;
  await deleteWaybill(state.active.id);
  dialog.close();
  await refreshList();
});

$("#gpsButton").addEventListener("click", () => {
  if (!navigator.geolocation) return showNotice("GPS is not available on this device.");
  $("#gpsStatus").textContent = "Capturing location…";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.active.latitude = position.coords.latitude;
      state.active.longitude = position.coords.longitude;
      state.active.gpsAccuracy = position.coords.accuracy;
      state.active.gpsCapturedAt = new Date(position.timestamp).toISOString();
      $("#gpsStatus").textContent = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)} (±${Math.round(position.coords.accuracy)} m)`;
      scheduleAutosave();
    },
    (error) => showNotice(`Location was not captured: ${error.message}`),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
});

$("#photoInput").addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    event.target.value = "";
    return showNotice("Please use a photo smaller than 5 MB for reliable offline storage.");
  }
  const reader = new FileReader();
  reader.onload = () => {
    state.active.photo = reader.result;
    photoPreview.src = reader.result;
    photoPreview.hidden = false;
    scheduleAutosave();
  };
  reader.readAsDataURL(file);
});

$("#exportButton").addEventListener("click", async () => {
  const data = JSON.stringify({ exportedAt: new Date().toISOString(), waybills: await listWaybills() }, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `safiroute-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
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
    document.querySelectorAll("[data-filter]").forEach((chip) => chip.classList.toggle("active", chip === button));
    await refreshList();
  });
});

$("#setupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  profile = {
    id: "profile",
    operatorName: $("#setupName").value.trim(),
    role: "sales",
    vehicleNumber: "",
    pinHash: null,
    updatedAt: new Date().toISOString()
  };
  await saveProfile(profile);
  await enterApp();
});

$("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const pin = $("#settingsPin").value.trim();
  profile = {
    ...profile,
    operatorName: $("#settingsName").value.trim(),
    role: "sales",
    pinHash: pin ? await hashPin(pin) : profile.pinHash,
    updatedAt: new Date().toISOString()
  };
  await saveProfile(profile);
  $("#settingsPin").value = "";
  renderChrome();
  const notice = $("#settingsNotice");
  notice.textContent = "Saved on this phone.";
  notice.hidden = false;
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
