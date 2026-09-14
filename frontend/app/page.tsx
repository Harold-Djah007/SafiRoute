"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { loginRequest, saveSession } from "@/lib/api";

const DEMOS = [
  ["sales", "Sales officer — create waybills"],
  ["supervisor", "Approve and oversee"],
  ["warehouse", "Load and dispatch"],
  ["driver", "Complete deliveries"],
  ["finance", "Audit and reports"],
  ["admin", "Full access"],
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("sales");
  const [password, setPassword] = useState("safiroute");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await loginRequest(username, password);
      saveSession(data.token, data.user);
      router.push(data.user.role === "driver" ? "/field" : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-forest-950 p-12 text-cream lg:flex lg:flex-col lg:justify-between">
        <img src="/safiroute-logo.png" alt="SafiRoute" className="w-72 max-w-full" />
        <div>
          <p className="font-display text-5xl leading-tight">
            Paper waybills,
            <br />
            retired.
          </p>
          <p className="mt-6 max-w-md text-lg text-cream/75">
            Safisana Ghana&apos;s sales-to-delivery record: signed, geo-stamped,
            QR-verified, and available even when the driver is offline.
          </p>
        </div>
        <p className="text-sm text-gold-400">Ashaiman Plant · Organic fertilizer · Renewable energy</p>
      </section>
      <section className="flex items-center justify-center px-6 py-16">
        <form onSubmit={onSubmit} className="ticket w-full max-w-md rounded-3xl bg-paper p-8 shadow-ticket">
          <img src="/safiroute-icon.png" alt="" className="mb-4 h-14 w-14 rounded-2xl object-cover lg:hidden" />
          <p className="text-sm uppercase tracking-[0.2em] text-gold-600">SafiRoute</p>
          <h1 className="mt-2 font-display text-3xl text-forest-800">Sign in</h1>
          <p className="mt-2 text-sm text-ink/70">Demo password for every account: <b>safiroute</b></p>
          <label className="mt-6 block text-sm font-medium">Username</label>
          <input
            className="mt-1 w-full rounded-xl border border-forest-800/15 bg-white px-3 py-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <label className="mt-4 block text-sm font-medium">Password</label>
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-forest-800/15 bg-white px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
          <button
            disabled={busy}
            className="mt-6 w-full rounded-xl bg-forest-800 py-3 font-semibold text-cream disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Enter dashboard"}
          </button>
          <div className="mt-6 grid grid-cols-2 gap-2 text-xs">
            {DEMOS.map(([user, caption]) => (
              <button
                type="button"
                key={user}
                onClick={() => setUsername(user)}
                className="rounded-lg border border-forest-800/10 bg-cream px-2 py-2 text-left hover:border-gold-500"
              >
                <span className="block font-semibold text-forest-800">{user}</span>
                <span className="text-ink/60">{caption}</span>
              </button>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}
