"use client";

import { FieldShell } from "@/components/FieldShell";

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <FieldShell>{children}</FieldShell>;
}
