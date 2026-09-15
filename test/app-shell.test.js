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
  for (const id of ["waybillForm", "signatureCanvas", "authorisedSignature", "dispatchedSignature", "photoInput", "gpsButton", "connectionBadge", "settingsView", "lockScreen", "logoutButton"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
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
