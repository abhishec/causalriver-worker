"use client";

import { MembersTab } from "@/components/settings/MembersTab";

export function SettingsMembers({ orgId }: { orgId: string }) {
  return <MembersTab orgId={orgId} />;
}
