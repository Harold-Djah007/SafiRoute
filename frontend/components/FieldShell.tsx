"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { clearSession, readUser, type User } from "@/lib/api";
import { flushQueue, listQueue } from "@/lib/offline";

function FieldShellInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const tab = search.get("tab") || "";
  const [user, setUser] = useState<User | null>(null);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [syncNote, setSyncNote] = useState("");

  async function refreshQueue() {
    try {
      setQueued((await listQueue()).length);
    } catch {
      setQueued(0);
    }
  }

  useEffect(() => {
    const current = readUser();
    if (!current) {
      router.replace("/");
      return;
    }
    setUser(current);
    setOnline(navigator.onLine);
    refreshQueue();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [router]);

  useEffect(() => {
    if (!online) return;
    flushQueue()
      .then((result) => {
        if (result.sent) setSyncNote(`${result.sent} queued delivery sent`);
        refreshQueue();
      })
      .catch(() => undefined);
  }, [online, pathname]);

  if (!user) {
    return <div className="grid min-h-dvh place-items-center text-forest-800">Opening field app…</div>;
  }

  return (
    <div className="field-shell min-h-dvh bg-cream text-ink">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-forest-950 text-cream">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link href="/field" className="flex items-center gap-2">
            <img src="/safiroute-icon.png" alt="" className="h-9 w-9 rounded-lg object-cover" />
            <div>
              <p className="font-display text-lg leading-none">SafiRoute</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-gold-400">Field</p>
            </div>
          </Link>
          <div className="text-right text-xs">
            <p className="font-semibold">{user.full_name}</p>
            <p className={online ? "text-emerald-300" : "text-amber-300"}>
              {online ? "Online" : "Offline"}
              {queued ? ` · ${queued} queued` : ""}
            </p>
          </div>
        </div>
        {!online && (
          <p className="bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-forest-950">
            No signal — deliveries save on this phone and send when 4G returns.
          </p>
        )}
        {online && syncNote && (
          <p className="bg-emerald-700 px-4 py-1.5 text-center text-xs text-white">{syncNote}</p>
        )}
      </header>
      <main className="mx-auto w-full max-w-lg px-4 pb-28 pt-4">{children}</main>
      <nav className="field-nav">
        <Link href="/field" className={pathname === "/field" && tab !== "sync" ? "text-gold-400" : "text-cream/80"}>
          Runs
        </Link>
        <Link href="/field?tab=sync" className={tab === "sync" ? "text-gold-400" : "text-cream/80"}>
          Queue{queued ? ` (${queued})` : ""}
        </Link>
        <Link href="/waybills" className="text-cream/80">
          Office
        </Link>
        <button
          type="button"
          className="text-cream/80"
          onClick={() => {
            clearSession();
            router.replace("/");
          }}
        >
          Sign out
        </button>
      </nav>
    </div>
  );
}

export function FieldShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center text-forest-800">Opening field app…</div>}>
      <FieldShellInner>{children}</FieldShellInner>
    </Suspense>
  );
}
