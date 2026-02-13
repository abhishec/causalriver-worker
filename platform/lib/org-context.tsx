"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_core_brain: boolean;
}

export interface OrgMembership {
  organization_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  is_platform_admin: boolean;
  organization: Organization;
}

interface OrgContextType {
  currentOrg: Organization | null;
  currentRole: string | null;
  organizations: OrgMembership[];
  isPlatformAdmin: boolean;
  isLoading: boolean;
  switchOrg: (orgId: string) => void;
  refreshOrgs: () => Promise<void>;
}

/* ── Context ───────────────────────────────────────────────────────── */

const OrgContext = createContext<OrgContextType | null>(null);

const STORAGE_KEY = "nexus_current_org";

/* ── Provider ──────────────────────────────────────────────────────── */

export function OrgProvider({ children }: { children: ReactNode }) {
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  /* Load user's orgs on mount */
  const loadOrgs = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: rows } = await supabase
        .from("org_members")
        .select(
          "organization_id, role, is_platform_admin, organizations:organization_id(id, name, slug, plan, is_core_brain)"
        )
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true });

      if (!rows || rows.length === 0) {
        setIsLoading(false);
        return;
      }

      const mapped: OrgMembership[] = (rows as any[]).map((r) => ({
        organization_id: r.organization_id,
        role: r.role,
        is_platform_admin: r.is_platform_admin,
        organization: r.organizations,
      }));

      const isAdmin = mapped.some((m) => m.is_platform_admin);
      setMemberships(mapped);
      setIsPlatformAdmin(isAdmin);

      /* Restore saved org or pick first non-core */
      const saved =
        typeof window !== "undefined"
          ? localStorage.getItem(STORAGE_KEY)
          : null;

      const validSaved = saved
        ? mapped.find((m) => m.organization_id === saved)
        : null;

      if (validSaved) {
        setCurrentOrgId(saved);
      } else {
        const firstNonCore =
          mapped.find((m) => !m.organization.is_core_brain) ?? mapped[0];
        setCurrentOrgId(firstNonCore.organization_id);
      }
    } catch {
      /* silently fail — user not logged in */
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  /* Switch org: persist in localStorage + cookie (for server components) */
  const switchOrg = useCallback(
    (orgId: string) => {
      const exists = memberships.find((m) => m.organization_id === orgId);
      if (!exists && !isPlatformAdmin) return;

      setCurrentOrgId(orgId);
      localStorage.setItem(STORAGE_KEY, orgId);
      document.cookie = `${STORAGE_KEY}=${orgId};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;

      /* Force reload to refresh server components with new org */
      window.location.reload();
    },
    [memberships, isPlatformAdmin]
  );

  /* Derive current org + role from state */
  const currentMembership = memberships.find(
    (m) => m.organization_id === currentOrgId
  );
  const currentOrg = currentMembership?.organization ?? null;
  const currentRole = currentMembership?.role ?? null;

  return (
    <OrgContext.Provider
      value={{
        currentOrg,
        currentRole,
        organizations: memberships,
        isPlatformAdmin,
        isLoading,
        switchOrg,
        refreshOrgs: loadOrgs,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

/* ── Hook ──────────────────────────────────────────────────────────── */

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within <OrgProvider>");
  return ctx;
}
