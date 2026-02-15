import { AgentsClient } from "./agents-client";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Agent Runs",
};

export default function AgentsPage() {
  return <AgentsClient />;
}
