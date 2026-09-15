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
  for (const id of ["waybillForm", "signatureCanvas", "authorisedSignature", "dispatchedSignature", "photoInput", "gpsButton", "connectionBadge", "settingsView", "lockScreen", "logoutButton", "importBackup", "settingsPhone", "pinForm", "waybillSearch"]) {
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
  assert.match(source, /safiroute-shell-v16/);
});

test("settings is a grouped list, not stacked panels", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /class="settings-group"/);
  assert.match(html, /class="settings-row settings-row-identity"/);
  assert.match(html, /id=["']pinStatusValue["']/);
  assert.doesNotMatch(html, /settings-hero panel/);
  assert.doesNotMatch(html, /Save sales details/);
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
