import { buildIngestPayload, healthEndpoint, ingestEndpoint, needsHqFlush, normalizeSyncUrl } from "./model.js";
import { listWaybills, saveProfile, saveWaybill } from "./storage.js";

let flushing = false;

function errorMessage(error, origin) {
  const text = error?.message || String(error || "Unknown error");
  if (/failed to fetch|networkerror|load failed/i.test(text)) {
    return `Could not reach HQ at ${origin}. Keep this pad pending and retry when the server is up.`;
  }
  return text;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text.slice(0, 180) };
  }
}

function detailFromBody(body, fallback) {
  const detail = body?.detail ?? body?.error;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object") {
    const first = Object.values(detail)[0];
    if (Array.isArray(first)) return String(first[0]);
    if (first) return String(first);
  }
  return fallback;
}

async function pingHealth(origin) {
  const url = healthEndpoint(origin);
  const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`HQ did not answer at ${url} (${response.status}).`);
  }
}

async function postIngest(origin, payload, token) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers["X-SafiRoute-Ingest"] = token;
  const response = await fetch(ingestEndpoint(origin), {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(detailFromBody(body, `HQ refused this waybill (HTTP ${response.status}).`));
  }
  if (!body.accepted && !body.id) {
    throw new Error("HQ did not confirm this waybill.");
  }
  return body;
}

export async function flushPending({ profile, onProgress } = {}) {
  if (flushing) return { skipped: true, reason: "busy", profile };
  const origin = normalizeSyncUrl(profile?.syncUrl);
  if (!origin) {
    return {
      skipped: true,
      reason: "no-url",
      accepted: 0,
      failed: 0,
      queued: 0,
      message: "No HQ server URL. Completed pads stay pending on this phone.",
      profile
    };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      skipped: true,
      reason: "offline",
      accepted: 0,
      failed: 0,
      queued: 0,
      message: "Offline. Pads stay pending until this phone is online.",
      profile
    };
  }

  flushing = true;
  const started = new Date().toISOString();
  try {
    const items = await listWaybills();
    const queue = items.filter(needsHqFlush);
    if (!queue.length) {
      const nextProfile = {
        ...profile,
        lastSyncAt: started,
        lastSyncError: "",
        lastSyncAccepted: 0,
        lastSyncFailed: 0,
        updatedAt: started
      };
      await saveProfile(nextProfile);
      return { skipped: false, accepted: 0, failed: 0, queued: 0, profile: nextProfile };
    }

    try {
      await pingHealth(origin);
    } catch (error) {
      const message = errorMessage(error, origin);
      const nextProfile = {
        ...profile,
        lastSyncAt: started,
        lastSyncError: message,
        lastSyncAccepted: 0,
        lastSyncFailed: 0,
        updatedAt: started
      };
      await saveProfile(nextProfile);
      return {
        skipped: false,
        accepted: 0,
        failed: 0,
        queued: queue.length,
        lastError: message,
        message,
        profile: nextProfile
      };
    }

    let accepted = 0;
    let failed = 0;
    let lastError = "";
    for (const waybill of queue) {
      const snapshot = { ...waybill, syncStatus: "syncing", syncError: "" };
      await saveWaybill(snapshot);
      onProgress?.();
      try {
        const result = await postIngest(origin, buildIngestPayload(waybill, profile), profile?.ingestToken);
        await saveWaybill({
          ...waybill,
          syncStatus: "synced",
          syncError: "",
          syncedAt: new Date().toISOString(),
          serverId: result.id,
          serverNumber: result.waybill_number || "",
          verificationToken: result.verification_token || waybill.verificationToken || ""
        });
        accepted += 1;
      } catch (error) {
        const message = errorMessage(error, origin);
        lastError = message;
        failed += 1;
        await saveWaybill({
          ...waybill,
          syncStatus: "failed",
          syncError: message
        });
      }
      onProgress?.();
    }

    const finished = new Date().toISOString();
    const nextProfile = {
      ...profile,
      lastSyncAt: finished,
      lastSyncError: failed ? lastError : "",
      lastSyncAccepted: accepted,
      lastSyncFailed: failed,
      updatedAt: finished
    };
    await saveProfile(nextProfile);
    return { skipped: false, accepted, failed, queued: queue.length, lastError, profile: nextProfile };
  } finally {
    flushing = false;
  }
}
