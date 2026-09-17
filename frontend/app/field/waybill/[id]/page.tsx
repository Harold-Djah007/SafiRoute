"use client";

import { useParams } from "next/navigation";
import { SalesWaybillEditor } from "@/components/SalesWaybillEditor";

export default function SalesWaybillPage() {
  const params = useParams<{ id: string }>();
  return <SalesWaybillEditor waybillId={params.id} />;
}
