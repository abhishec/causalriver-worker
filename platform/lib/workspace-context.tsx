"use client";

import { logger } from "@/lib/logger";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_core_brain: boolean;
  description: string | null;
  // Customer grouping (from customers table via customer_id FK).
  // null for internal workspaces (CORE brain, test workspaces).
  // Never used in brain/signal/learning paths — display + billing only.
  customer_id:   string | null;
  customer_name: string | null;  // e.g. "Tookitaki" — for grouping in switcher UI
  customer_slug: string | null;  // e.g. "tookitaki"
}

export interface WorkspaceMembership {
  organization_id: string;  // DB column stays as-is
  role: "owner" | "admin" | "member" | "viewer";
  is_platform_admin: boolean;
  workspace: Workspace;
}

export interface CustomerInfo {
  id: string;
  name: string;
  slug: string;
}

interface WorkspaceContextType {
  currentWorkspace: Workspace | null;
  currentCustomer: CustomerInfo | null;
  currentRole: string | null;
  workspaces: WorkspaceMembership[];
  isPlatformAdmin: boolean;
  isLoading: boolean;
  fetchError: string | null;
  switchWorkspace: (workspaceId: string, opts?: { skipReload?: boolean }) => void;
  refreshWorkspaces: () => Promise<void>;
  // Customer-first navigation
  activeCustomerId: string | null;
  setActiveCustomer: (customerId: string) => void;
  customersForUser: CustomerInfo[];
  workspacesForActiveCustomer: WorkspaceMembership[];
}

/* ── Context ───────────────────────────────────────────────────────── */

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

const STORAGE_KEY = "nexus_current_workspace";
const OLD_STORAGE_KEY = "nexus_current_org";  // migration fallback
const CACHE_KEY = "nexus_workspace_memberships";
const OLD_CACHE_KEY = "nexus_org_memberships";  // migration fallback
const CUSTOMER_KEY = "nexus_active_customer";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/* ── localStorage migration helpers ────────────────────────────────── */

function migrateLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    // Migrate current workspace selection
    const oldVal = localStorage.getItem(OLD_STORAGE_KEY);
    if (oldVal && !localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, oldVal);
    }
    // Clean up old keys
    localStorage.removeItem(OLD_STORAGE_KEY);
    localStorage.removeItem(OLD_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/* ── localStorage SWR cache helpers ───────────────────────────────── */

interface CachedData {
  memberships: WorkspaceMembership[];
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

function writeCache(memberships: WorkspaceMembership[], isPlatformAdmin: boolean) {
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

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  // Run migration on first mount
  useState(() => { migrateLocalStorage(); return null; });

  // HYDRATION-SAFE: All state starts with the same value on both server and client.
  // localStorage is NEVER read during initial render (useState initializer) to prevent
  // hydration mismatches. All localStorage reads happen exclusively in useEffect.
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  // Always start true on both server and client — avoids hydration mismatch.
  // The useEffect below sets it to false immediately if cache is fresh.
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const retryCountRef = useRef(0);

  // Customer-first navigation state — null on SSR, hydrated from localStorage in useEffect
  const [activeCustomerId, setActiveCustomerIdRaw] = useState<string | null>(null);

  /* Load user's workspaces via API route (bypasses RLS recursion issue) */
  const loadWorkspaces = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch("/api/workspace/memberships", {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        // 401 = session expired, not retryable — bail silently (middleware will redirect)
        if (res.status === 401) {
          setIsLoading(false);
          return;
        }
        // 5xx / other errors are retryable — treat as network failure
        throw new Error(`memberships API returned ${res.status}`);
      }

      const json = await res.json();
      const rows = json.memberships;

      if (!rows || rows.length === 0) {
        logger.warn("[WorkspaceProvider] No workspace memberships found for user");
        setMemberships([]);
        setIsPlatformAdmin(false);
        setIsLoading(false);
        return;
      }

      const mapped: WorkspaceMembership[] = (rows as any[]).map((r: any) => {
        const org   = r.organizations;
        if (!org) return null; // skip rows with broken FK
        const cust  = org?.customer ?? null;
        return {
          organization_id: r.organization_id,
          role: r.role,
          is_platform_admin: r.is_platform_admin,
          workspace: {
            id:            org.id,
            name:          org.name,
            slug:          org.slug,
            plan:          org.plan,
            is_core_brain: org.is_core_brain,
            description:   org.description   ?? null,
            customer_id:   org.customer_id   ?? null,
            customer_name: cust?.name        ?? null,
            customer_slug: cust?.slug        ?? null,
          },
        };
      }).filter(Boolean) as WorkspaceMembership[];

      const isAdmin = mapped.some((m) => m.is_platform_admin);
      setMemberships(mapped);
      setIsPlatformAdmin(isAdmin);

      // Persist to localStorage for instant hydration on next page load
      writeCache(mapped, isAdmin);

      /* Restore saved workspace or pick first non-core */
      const saved = localStorage.getItem(STORAGE_KEY);

      const validSaved = saved
        ? mapped.find((m) => m.organization_id === saved)
        : null;

      if (validSaved) {
        setCurrentWorkspaceId(saved);
      } else {
        const firstNonCore =
          mapped.find((m) => !m.workspace.is_core_brain) ?? mapped[0];
        setCurrentWorkspaceId(firstNonCore.organization_id);
        // Persist so next reload doesn't re-run auto-select
        try { localStorage.setItem(STORAGE_KEY, firstNonCore.organization_id); } catch { /* ignore */ }
      }
      // Success — reset retry state
      retryCountRef.current = 0;
      setFetchError(null);
      setIsLoading(false);
    } catch (err) {
      if (retryCountRef.current < 2) {
        retryCountRef.current++;
        const delay = 1000 * retryCountRef.current; // 1s, 2s backoff
        logger.warn(
          `[WorkspaceProvider] fetch failed, retry ${retryCountRef.current}/2 in ${delay}ms`
        );
        setTimeout(loadWorkspaces, delay);
        return; // don't setIsLoading(false) yet — retrying
      }
      logger.error("[WorkspaceProvider] fetch failed after 2 retries", err);
      setFetchError("Failed to load workspaces. Please refresh the page.");
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Hydrate client-only localStorage state after mount (SSR-safe: runs only on client).
    // NOTE: All localStorage reads are in this useEffect — never in useState initializers —
    // to ensure SSR and client first-render produce identical HTML (prevents hydration mismatch).
    const savedWorkspaceId = localStorage.getItem(STORAGE_KEY);
    const savedCustomerId = localStorage.getItem(CUSTOMER_KEY);
    if (savedCustomerId) setActiveCustomerIdRaw(savedCustomerId);

    // Skip background fetch if localStorage cache is very fresh (< 60s).
    // Prevents redundant /api/workspace/memberships calls on rapid navigations.
    const cached = readCache();
    const isFresh = cached && (Date.now() - cached.timestamp < 60_000);
    if (isFresh) {
      // Hydrate memberships + admin flag from cache immediately
      setMemberships(cached.memberships);
      setIsPlatformAdmin(cached.isPlatformAdmin);

      // Restore saved workspace selection or auto-select first non-core
      if (savedWorkspaceId) {
        const validSaved = cached.memberships.find((m) => m.organization_id === savedWorkspaceId);
        if (validSaved) {
          setCurrentWorkspaceId(savedWorkspaceId);
        } else if (cached.memberships.length > 0) {
          // Saved workspace no longer valid — auto-select first non-core
          const firstNonCore =
            cached.memberships.find((m) => !m.workspace.is_core_brain) ?? cached.memberships[0];
          setCurrentWorkspaceId(firstNonCore.organization_id);
          try { localStorage.setItem(STORAGE_KEY, firstNonCore.organization_id); } catch { /* ignore */ }
        }
      } else if (cached.memberships.length > 0) {
        // No saved workspace selection — auto-select first non-core
        const firstNonCore =
          cached.memberships.find((m) => !m.workspace.is_core_brain) ?? cached.memberships[0];
        setCurrentWorkspaceId(firstNonCore.organization_id);
        try { localStorage.setItem(STORAGE_KEY, firstNonCore.organization_id); } catch { /* ignore */ }
      }
      setIsLoading(false);
    } else {
      // No fresh cache — restore saved workspace ID first (API call will validate it)
      if (savedWorkspaceId) setCurrentWorkspaceId(savedWorkspaceId);
      loadWorkspaces();
    }
  }, [loadWorkspaces]);

  /* Switch workspace: persist in localStorage + cookie (for server components)
   * Pass skipReload=true when navigating programmatically (e.g. dashboard → copilot)
   * so the reload doesn't kill the router.push. */
  const switchWorkspace = useCallback(
    (workspaceId: string, { skipReload = false }: { skipReload?: boolean } = {}) => {
      const exists = memberships.find((m) => m.organization_id === workspaceId);
      if (!exists && !isPlatformAdmin) return;

      setCurrentWorkspaceId(workspaceId);
      localStorage.setItem(STORAGE_KEY, workspaceId);
      // Bust membership cache so next reload fetches fresh data
      localStorage.removeItem(CACHE_KEY);
      // Set both new and old cookie for backward compat with server components
      document.cookie = `${STORAGE_KEY}=${workspaceId};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
      document.cookie = `${OLD_STORAGE_KEY}=${workspaceId};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;

      if (!skipReload) {
        /* Force reload to refresh server components with new workspace */
        window.location.reload();
      }
    },
    [memberships, isPlatformAdmin]
  );

  /* Derive current workspace + role + customer from state */
  const currentMembership = memberships.find(
    (m) => m.organization_id === currentWorkspaceId
  );
  const currentWorkspace = currentMembership?.workspace ?? null;
  const currentRole = currentMembership?.role ?? null;
  const currentCustomer: CustomerInfo | null =
    currentWorkspace?.customer_id
      ? {
          id: currentWorkspace.customer_id,
          name: currentWorkspace.customer_name!,
          slug: currentWorkspace.customer_slug!,
        }
      : null;

  /* ── Customer-first navigation ──────────────────────────────────── */

  // Derive unique customers from workspace memberships
  const customersForUser = useMemo<CustomerInfo[]>(() => {
    const seen = new Map<string, CustomerInfo>();
    for (const m of memberships) {
      const { customer_id, customer_name, customer_slug } = m.workspace;
      if (customer_id && customer_name && !seen.has(customer_id)) {
        seen.set(customer_id, { id: customer_id, name: customer_name, slug: customer_slug ?? customer_id });
      }
    }
    return Array.from(seen.values());
  }, [memberships]);

  // Auto-set activeCustomerId for non-admins with a single customer
  useEffect(() => {
    if (activeCustomerId) return; // already set
    if (isPlatformAdmin) return;  // admins choose explicitly
    if (customersForUser.length === 1) {
      setActiveCustomerIdRaw(customersForUser[0].id);
      try { localStorage.setItem(CUSTOMER_KEY, customersForUser[0].id); } catch { /* ignore */ }
    }
  }, [activeCustomerId, isPlatformAdmin, customersForUser]);

  const setActiveCustomer = useCallback((customerId: string) => {
    const value = customerId || null;
    setActiveCustomerIdRaw(value);
    try {
      if (value) localStorage.setItem(CUSTOMER_KEY, value);
      else localStorage.removeItem(CUSTOMER_KEY);
    } catch { /* ignore */ }
  }, []);

  // Workspaces filtered to active customer
  const workspacesForActiveCustomer = useMemo(() => {
    if (!activeCustomerId) return [];
    return memberships.filter((m) => m.workspace.customer_id === activeCustomerId);
  }, [memberships, activeCustomerId]);

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        currentCustomer,
        currentRole,
        workspaces: memberships,
        isPlatformAdmin,
        isLoading,
        fetchError,
        switchWorkspace,
        refreshWorkspaces: loadWorkspaces,
        activeCustomerId,
        setActiveCustomer,
        customersForUser,
        workspacesForActiveCustomer,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

/* ── Hook ──────────────────────────────────────────────────────────── */

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within <WorkspaceProvider>");
  return ctx;
}
