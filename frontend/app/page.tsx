"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loginRequest, readUser, saveSession } from "@/lib/api";

const DEMOS = [
  ["sales", "Sales officer — create waybills"],
  ["supervisor", "Approve and oversee"],
  ["warehouse", "Load and dispatch"],
  ["driver", "Field deliveries on a phone"],
  ["finance", "Audit and reports"],
  ["admin", "Full access"],
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("sales");
  const [password, setPassword] = useState("safiroute");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const user = readUser();
    if (user) router.replace(user.role === "driver" ? "/field" : "/dashboard");
  }, [router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await loginRequest(username, password);
      saveSession(data.token, data.user);
      router.push(data.user.role === "driver" ? "/field" : "/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Start Django on 127.0.0.1:8877 and keep this page on localhost:3000."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative overflow-hidden bg-forest-950 p-8 text-cream sm:p-12 lg:flex lg:flex-col lg:justify-between">
        <img src="/safiroute-logo.png" alt="SafiRoute" className="w-56 max-w-full sm:w-72" />
        <div className="mt-10 lg:mt-0">
          <p className="font-display text-4xl leading-tight sm:text-5xl">
            Paper waybills,
            <br />
            retired.
          </p>
          <p className="mt-6 max-w-md text-base text-cream/75 sm:text-lg">
            Safisana Ghana&apos;s sales-to-delivery record: signed, geo-stamped, QR-verified, and ready in the field
            even when the truck leaves 4G coverage.
          </p>
        </div>
        <p className="mt-8 text-sm text-gold-400">Ashaiman Plant · Organic fertilizer · Renewable energy</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <form onSubmit={onSubmit} className="ticket w-full max-w-md rounded-3xl bg-paper p-6 shadow-ticket sm:p-8">
          <p className="text-sm uppercase tracking-[0.2em] text-gold-600">SafiRoute</p>
          <h1 className="mt-2 font-display text-3xl text-forest-800">Sign in</h1>
          <p className="mt-2 text-sm text-ink/70">
            Demo password for every account: <b>safiroute</b>
          </p>
          <label className="mt-6 block text-sm font-medium" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            autoComplete="username"
            className="tap mt-1 w-full rounded-xl border border-forest-800/15 bg-white px-3 py-3"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <label className="mt-4 block text-sm font-medium" htmlFor="password">
            Password
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="password"
              autoComplete="current-password"
              type={showPassword ? "text" : "password"}
              className="tap w-full rounded-xl border border-forest-800/15 bg-white px-3 py-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="tap shrink-0 rounded-xl border border-forest-800/15 px-3 text-sm font-semibold"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
          <button
            disabled={busy}
            className="tap mt-6 w-full rounded-xl bg-forest-800 py-3.5 font-semibold text-cream disabled:opacity-60"
          >
            {busy ? "Signing in…" : username === "driver" ? "Open field app" : "Enter dashboard"}
          </button>
          <div className="mt-6 grid grid-cols-2 gap-2 text-xs">
            {DEMOS.map(([user, caption]) => (
              <button
                type="button"
                key={user}
                onClick={() => setUsername(user)}
                className={`rounded-xl border px-2 py-2 text-left ${
                  username === user ? "border-gold-500 bg-gold-500/15" : "border-forest-800/10 bg-cream"
                }`}
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
