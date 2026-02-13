import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

const CORE_ORG_ID = "00000000-0000-4000-a000-000000000001";
const STORAGE_KEY = "nexus_current_org";

/**
 * Server-side helper to resolve the current org ID.
 *
 * Reads the `nexus_current_org` cookie (set by OrgProvider on the client),
 * validates the user is actually a member of that org, and falls back to
 * the user's first org or the Core Brain org.
 */
export async function getCurrentOrgId(): Promise<string> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return CORE_ORG_ID;

    /* 1. Try cookie value */
    const cookieStore = await cookies();
    const saved = cookieStore.get(STORAGE_KEY)?.value;

    if (saved) {
      const { data: membership } = await supabase
        .from("org_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("organization_id", saved)
        .single();

      if (membership) return saved;

      /* Platform admins can view any org */
      const { data: admin } = await supabase
        .from("org_members")
        .select("is_platform_admin")
        .eq("user_id", user.id)
        .eq("is_platform_admin", true)
        .limit(1)
        .single();

      if (admin) return saved;
    }

    /* 2. Fallback: first non-core org */
    const { data: first } = await supabase
      .from("org_members")
      .select("organization_id, organizations:organization_id(is_core_brain)")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true });

    if (first && first.length > 0) {
      const nonCore = (first as any[]).find(
        (m) => !(m.organizations as any)?.is_core_brain
      );
      return nonCore?.organization_id ?? first[0].organization_id;
    }

    return CORE_ORG_ID;
  } catch {
    return CORE_ORG_ID;
  }
}
