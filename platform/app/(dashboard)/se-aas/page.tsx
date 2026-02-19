import { redirect } from "next/navigation";

export const metadata = { title: "Engineering · NexusBrain" };

/**
 * SE-aaS page — redirects to the unified Intelligence copilot with SE-aaS service pre-selected.
 * All services now share the same chat + artifact pane pattern (Claude Cowork).
 */
export default function SeAasPage() {
  redirect("/copilot?service=seaas");
}
