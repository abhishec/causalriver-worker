"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OrgActionButtons({
  orgId,
  orgName,
  currentPlan,
  planOptions,
  isCoreOrg,
}: {
  orgId: string;
  orgName: string;
  currentPlan: string;
  planOptions: string[];
  isCoreOrg: boolean;
}) {
  const router = useRouter();
  const [showPlanMenu, setShowPlanMenu] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changePlan(plan: string) {
    setLoading("plan");
    setError(null);
    try {
      const res = await fetch("/api/admin/orgs/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, plan }),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowPlanMenu(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  }

  async function deleteOrg() {
    if (deleteInput !== orgName) return;
    setLoading("delete");
    setError(null);
    try {
      const res = await fetch("/api/admin/orgs/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/admin/orgs");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0 relative">
      {error && (
        <span className="text-xs text-danger bg-danger/10 px-2 py-1 rounded border border-danger/20">{error}</span>
      )}

      {/* Change Plan button + dropdown */}
      <div className="relative">
        <button
          onClick={() => { setShowPlanMenu((v) => !v); setError(null); }}
          disabled={loading === "plan"}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface border border-border hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
          </svg>
          Change Plan
        </button>

        {showPlanMenu && (
          <>
            {/* Click-away overlay */}
            <div className="fixed inset-0 z-40" onClick={() => setShowPlanMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 w-40 bg-card border border-border rounded-lg shadow-elevated overflow-hidden animate-scale-up">
              {planOptions.map((plan) => (
                <button
                  key={plan}
                  onClick={() => changePlan(plan)}
                  disabled={plan === currentPlan || loading === "plan"}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-default"
                >
                  <span className="capitalize font-medium">{plan}</span>
                  {plan === currentPlan && (
                    <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Delete Org button */}
      {!isCoreOrg && (
        <button
          onClick={() => { setShowDeleteModal(true); setShowPlanMenu(false); setError(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-danger bg-danger/10 hover:bg-danger/20 border border-danger/20 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          Delete Org
        </button>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-elevated p-6 w-full max-w-sm animate-scale-up mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold">Delete AI Worker</div>
                <div className="text-xs text-muted">This cannot be undone</div>
              </div>
            </div>

            <p className="text-sm text-muted mb-4">
              Type <span className="font-semibold text-foreground">{orgName}</span> to confirm.
            </p>

            <input
              type="text"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder={orgName}
              autoFocus
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:border-danger/50 mb-4 placeholder:text-muted/40"
            />

            {error && <p className="text-xs text-danger mb-3">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteInput(""); setError(null); }}
                className="flex-1 px-3 py-2 rounded-lg text-sm bg-surface hover:bg-surface-hover border border-border transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteOrg}
                disabled={deleteInput !== orgName || loading === "delete"}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-danger text-white hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading === "delete" ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
