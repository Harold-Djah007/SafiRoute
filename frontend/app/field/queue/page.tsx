import { redirect } from "next/navigation";

export default function FieldQueueRedirect() {
  redirect("/field?tab=sync");
}
