"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { bootstrapSession, logoutRequest, readUser, type User } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Operations", roles: ["admin", "sales", "supervisor", "warehouse", "finance"] },
  { href: "/waybills", label: "Waybills", roles: ["admin", "sales", "supervisor", "warehouse", "finance", "driver"] },
  { href: "/waybills/new", label: "New waybill", roles: ["admin", "sales", "supervisor"] },
  { href: "/field", label: "Field app", roles: ["admin", "driver", "warehouse"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const current = readUser();
    if (!current) {
      router.replace("/");
      return;
    }
    setUser(current);
  }, [router]);

  useEffect(() => {
    setMenu(false);
  }, [pathname]);

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center text-forest-800">Opening SafiRoute…</div>
    );
  }

  const links = NAV.filter((item) => item.roles.includes(user.role));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <header className="flex items-center justify-between bg-forest-950 px-4 py-3 text-cream lg:hidden">
        <Link href={user.role === "driver" ? "/field" : "/dashboard"} className="flex items-center gap-2">
          <img src="/safiroute-icon.png" alt="" className="h-9 w-9 rounded-lg object-cover" />
          <span className="font-display text-lg">SafiRoute</span>
        </Link>
        <button type="button" className="tap rounded-lg border border-white/20 px-3 py-2 text-sm" onClick={() => setMenu((v) => !v)}>
          {menu ? "Close" : "Menu"}
        </button>
      </header>
      <aside className={`${menu ? "block" : "hidden"} bg-forest-950 text-cream lg:flex lg:min-h-screen lg:flex-col`}>
        <div className="hidden items-center gap-3 border-b border-white/10 px-5 py-5 lg:flex">
          <img src="/safiroute-icon.png" alt="" className="h-10 w-10 rounded-lg object-cover" />
          <div>
            <p className="font-display text-xl leading-none">SafiRoute</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-gold-400">Every delivery. Verified.</p>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {links.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-xl px-3 py-3 text-sm ${
                  active ? "bg-gold-500 text-forest-950" : "text-cream/80 hover:bg-white/10"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-white/10 p-4 text-sm">
          <p className="font-medium">{user.full_name}</p>
          <p className="text-cream/60">{user.role_display}</p>
          <p className="text-cream/50">{user.branch}</p>
          <button
            className="mt-3 text-gold-400 underline-offset-4 hover:underline"
            onClick={() => {
              clearSession();
              router.replace("/");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-h-screen px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}

export function StatusPill({ status, label }: { status: string; label: string }) {
  const colors: Record<string, string> = {
    draft: "bg-stone-200 text-stone-700",
    pending_approval: "bg-amber-100 text-amber-800",
    approved: "bg-sky-100 text-sky-800",
    loaded: "bg-indigo-100 text-indigo-800",
    dispatched: "bg-teal-100 text-teal-800",
    in_transit: "bg-cyan-100 text-cyan-900",
    delivered: "bg-emerald-100 text-emerald-800",
    partially_delivered: "bg-orange-100 text-orange-800",
    delivery_failed: "bg-rose-100 text-rose-800",
    cancelled: "bg-zinc-200 text-zinc-600",
  };
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${colors[status] || "bg-stone-100"}`}>
      <span className="status-dot bg-current opacity-70" />
      {label}
    </span>
  );
}

export { formatWhen } from "@/lib/format";
