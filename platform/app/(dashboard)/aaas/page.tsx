import { redirect } from "next/navigation";

export const metadata = { title: "Accounting · NexusBrain" };

/**
 * AAAS page — redirects to the unified Intelligence copilot with AAS service pre-selected.
 * All services now share the same chat + artifact pane pattern (Claude Cowork).
 */
export default function AaasPage() {
  redirect("/copilot?service=aas");
}
