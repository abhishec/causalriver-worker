"use client";

import { useState, useMemo } from "react";
import type { WidgetProps } from "./widget-registry";

export function DataTableWidget({ title, subtitle, data }: WidgetProps) {
  const columns = Array.isArray(data.columns) ? (data.columns as string[]) : [];
  const rows = Array.isArray(data.rows) ? (data.rows as Array<Record<string, unknown>>) : [];
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => {
    let r = rows;
    if (query) {
      r = r.filter((row) =>
        Object.values(row).some((v) => String(v).toLowerCase().includes(query.toLowerCase())),
      );
    }
    if (sortCol) {
      r = [...r].sort((a, b) => {
        const av = String(a[sortCol] ?? "");
        const bv = String(b[sortCol] ?? "");
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return r;
  }, [rows, sortCol, sortDir, query]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  return (
    <div className="rounded-xl bg-card border border-border-subtle overflow-hidden my-3">
      {(title || !!data.searchable) && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-surface">
          <div>
            {title && <h4 className="text-xs font-medium text-foreground">{title}</h4>}
            {subtitle && <p className="text-[10px] text-muted mt-0.5">{subtitle}</p>}
          </div>
          {!!data.searchable && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="px-2.5 py-1 text-[11px] rounded-lg bg-surface-hover border border-border text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/50 w-32"
            />
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border-subtle bg-surface/50">
              {columns.map((col) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted font-medium cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                >
                  {col} {sortCol === col ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-border-subtle last:border-b-0 hover:bg-surface-hover/50 transition-colors"
              >
                {columns.map((col) => (
                  <td key={col} className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {String(row[col] ?? "\u2014")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="py-6 text-center text-xs text-muted">No data</div>
        )}
      </div>
    </div>
  );
}
