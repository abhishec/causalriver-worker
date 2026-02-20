"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_core_brain: boolean;
  // Workspace / customer grouping (from customers table via customer_id FK).
  // null for internal orgs (CORE brain, test orgs).
  // Never used in brain/signal/learning paths — display + billing only.
  customer_id:   string | null;
  customer_name: string | null;  // e.g. "Tookitaki" — for grouping in switcher UI
  customer_slug: string | null;  // e.g. "tookitaki"
}

export interface OrgMembership {
  organization_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  is_platform_admin: boolean;
  organization: Organization;
}

export interface CustomerInfo {
  id: string;
  name: string;
  slug: string;
}

interface OrgContextType {
  currentOrg: Organization | null;
  currentCustomer: CustomerInfo | null;
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
const CACHE_KEY = "nexus_org_memberships";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/* ── localStorage SWR cache helpers ───────────────────────────────── */

interface CachedData {
  memberships: OrgMembership[];
  isPlatformAdmin: boolean;
  timestamp: number;
}

function readCache(): CachedData | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: CachedData = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(memberships: OrgMembership[], isPlatformAdmin: boolean) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ memberships, isPlatformAdmin, timestamp: Date.now() })
    );
  } catch {
    /* localStorage full or unavailable */
  }
}

/* ── Provider ──────────────────────────────────────────────────────── */

export function OrgProvider({ children }: { children: ReactNode }) {
  // Hydrate from localStorage immediately (synchronous, no loading flash)
  const [memberships, setMemberships] = useState<OrgMembership[]>(() => {
    const cached = readCache();
    return cached?.memberships ?? [];
  });
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(() => {
    const cached = readCache();
    return cached?.isPlatformAdmin ?? false;
  });
  // If we have cached data, skip the loading state entirely (instant UI)
  const [isLoading, setIsLoading] = useState(() => readCache() === null);

  /* Load user's orgs via API route (bypasses RLS recursion issue) */
  const loadOrgs = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch("/api/org/memberships", {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.warn("[OrgProvider] memberships API returned", res.status);
        setIsLoading(false);
        return;
      }

      const json = await res.json();
      const rows = json.memberships;

      if (!rows || rows.length === 0) {
        console.warn("[OrgProvider] No org memberships found");
        setIsLoading(false);
        return;
      }

      const mapped: OrgMembership[] = (rows as any[]).map((r: any) => {
        const org   = r.organizations;
        const cust  = org?.customer ?? null;
        return {
          organization_id: r.organization_id,
          role: r.role,
          is_platform_admin: r.is_platform_admin,
          organization: {
            id:            org.id,
            name:          org.name,
            slug:          org.slug,
            plan:          org.plan,
            is_core_brain: org.is_core_brain,
            customer_id:   org.customer_id   ?? null,
            customer_name: cust?.name        ?? null,
            customer_slug: cust?.slug        ?? null,
          },
        };
      });

      const isAdmin = mapped.some((m) => m.is_platform_admin);
      setMemberships(mapped);
      setIsPlatformAdmin(isAdmin);

      // Persist to localStorage for instant hydration on next page load
      writeCache(mapped, isAdmin);

      /* Restore saved org or pick first non-core */
      const saved = localStorage.getItem(STORAGE_KEY);

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
      /* silently fail — user not logged in or network error */
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  /* Derive current org + role + customer from state */
  const currentMembership = memberships.find(
    (m) => m.organization_id === currentOrgId
  );
  const currentOrg = currentMembership?.organization ?? null;
  const currentRole = currentMembership?.role ?? null;
  const currentCustomer: CustomerInfo | null =
    currentOrg?.customer_id
      ? {
          id: currentOrg.customer_id,
          name: currentOrg.customer_name!,
          slug: currentOrg.customer_slug!,
        }
      : null;

  return (
    <OrgContext.Provider
      value={{
        currentOrg,
        currentCustomer,
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
