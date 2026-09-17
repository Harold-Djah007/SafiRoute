import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("every service-worker app-shell asset exists", () => {
  const source = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const assets = [...source.matchAll(/^\s*"(\.\/[^\"]+)"[,]?$/gm)].map((match) => match[1]);
  assert.ok(assets.length >= 8);
  for (const asset of assets) {
    const relative = asset === "./" ? "index.html" : asset.slice(2);
    assert.equal(fs.existsSync(path.join(root, relative)), true, `Missing cached asset: ${asset}`);
  }
});

test("manifest is valid and provides a maskable app icon", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.purpose.includes("maskable")));
});

test("main document exposes the offline form controls", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const id of ["waybillForm", "signatureCanvas", "authorisedSignature", "dispatchedSignature", "photoInput", "gpsButton", "connectionBadge", "settingsView", "lockScreen", "logoutButton", "importBackup", "settingsPhone", "pinForm", "waybillSearch", "settingsSignatureThumb", "pinSaveButton", "iosInstallHint", "settingsPinDetails", "padChecklist", "updateBanner", "backupNag", "syncForm", "reloadAppButton", "syncNowButton"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test("atmosphere depicts waybill sheets and a delivery route", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /class="route"/);
  assert.match(html, /class="sheet sheet-a"/);
  assert.match(html, /class="sheet-bar"/);
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(css, /route-trace/);
  assert.match(css, /sheet-drift-a/);
  const js = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(js, /drawCheck/);
  assert.doesNotMatch(js, /gold: Math\.random/);
});

test("service worker cache is bumped with the shell", () => {
  const source = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(source, /safiroute-shell-v20/);
  assert.match(source, /SKIP_WAITING/);
  assert.match(source, /\.\/sync\.js/);
  assert.match(source, /pathname\.includes\("\/api\/"\)/);
});

test("settings is a grouped list, not stacked panels", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /class="settings-group"/);
  assert.match(html, /class="settings-row settings-row-identity"/);
  assert.match(html, /id=["']pinStatusValue["']/);
  assert.doesNotMatch(html, /settings-hero panel/);
  assert.doesNotMatch(html, /Save sales details/);
});

test("settings shows a signature thumbnail slot and always-visible iPhone install hint", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id=["']settingsSignatureThumb["']/);
  assert.match(html, /id=["']iosInstallHint["']/);
  assert.match(html, /Share → Add to Home Screen/);
  assert.match(html, /id=["']pinSaveButton["']/);
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(css, /settings-sign-thumb/);
  assert.match(css, /#settingsForm \.settings-row-commit/);
});

test("print stylesheet isolates the paper pad", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(css, /@page \{ size: A4 portrait/);
  assert.match(css, /dialog\[open\]/);
  assert.match(css, /print-color-adjust: exact/);
});

test("photos are compressed before IndexedDB and GPS failures reset status", () => {
  const js = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(js, /function compressPhoto/);
  assert.match(js, /image\/jpeg/);
  assert.match(js, /gpsErrorMessage/);
  assert.match(js, /gps-status-error/);
});

test("waybill dialog follows the Safisana paper pad", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const phrase of [
    "WAYBILL",
    "Deliver to",
    "Delivery Contact Name",
    "Description",
    "Authorised by",
    "Dispatched by",
    "I certify that I have received the above items.",
    "Received by"
  ]) {
    assert.match(html, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("dialog is modal with a focus trap and restore", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id=["']waybillDialog["'][^>]*aria-modal=["']true["']/);
  const js = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(js, /function trapDialogFocus/);
  assert.match(js, /restore\?\.focus/);
  assert.doesNotMatch(js, /key === ["']Escape["']/);
});

test("new shell version can skipWaiting after a reload prompt", () => {
  const js = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(js, /updateBanner/);
  assert.match(js, /SKIP_WAITING/);
  assert.match(js, /reloadAppButton/);
});

test("home nag and HQ sync controls are present", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id=["']backupNag["']/);
  assert.match(html, /id=["']settingsSyncUrl["']/);
  assert.match(html, /api\/pwa\/ingest/);
  assert.match(html, /Before Complete/);
  assert.doesNotMatch(html, /<select[^>]*role/);
});

