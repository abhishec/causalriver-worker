"use client";

import { useState, useEffect, useRef } from "react";
import type { ConnectorAuthConfig } from "@/lib/connectors/connector-auth-map";

export interface ConnectorSetupInfo extends ConnectorAuthConfig {
  connectorType: string;
}

type SetupStatus = "idle" | "connecting" | "submitting" | "done" | "error";

/** Opens a URL in a popup window and returns the window handle. */
function openPopup(url: string): Window | null {
  const w = 600, h = 700;
  const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
  const top  = Math.round(window.screenY + (window.outerHeight - h) / 2);
  return window.open(url, "connector-oauth", `width=${w},height=${h},left=${left},top=${top},scrollbars=yes`);
}

/** OAuth path: single-click or domain-first OAuth popup. */
function OAuthSetup({ data, onDone }: { data: ConnectorSetupInfo; onDone: () => void }) {
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState<SetupStatus>("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startOAuth = () => {
    const oauthUrl = data.authMethod === "oauth_domain"
      ? `${data.oauthRoute}?${data.domainParam ?? "domain"}=${encodeURIComponent(domain.trim())}`
      : data.oauthRoute!;

    setStatus("connecting");
    const popup = openPopup(oauthUrl);
    if (!popup) {
      // Popup blocked — fall back to new tab
      window.open(oauthUrl, "_blank");
      setStatus("idle");
      return;
    }

    // Listen for postMessage (if callback supports it)
    const msgHandler = (e: MessageEvent) => {
      if (e.data?.type === "connector-connected" || e.data?.type === "oauth-success") {
        cleanup();
        setStatus("done");
        onDone();
      }
    };
    window.addEventListener("message", msgHandler);

    // Poll for popup close as fallback
    pollRef.current = setInterval(() => {
      if (popup.closed) {
        cleanup();
        // Assume connected after popup closes
        setStatus("done");
        onDone();
      }
    }, 800);

    function cleanup() {
      window.removeEventListener("message", msgHandler);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  };

  // Cleanup on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  if (status === "done") {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-emerald-600 dark:text-emerald-400">
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        {data.displayName} connected — data will start flowing shortly
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.authMethod === "oauth_domain" && (
        <div>
          <label className="block text-[11px] font-medium text-muted mb-1">
            {data.displayName} Domain
          </label>
          <input
            type="text"
            value={domain}
            onChange={e => setDomain(e.target.value)}
            placeholder={data.domainPlaceholder ?? "yourcompany.example.com"}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>
      )}
      <button
        onClick={startOAuth}
        disabled={status === "connecting" || (data.authMethod === "oauth_domain" && !domain.trim())}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "connecting" ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Connecting…
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            Connect {data.displayName}
          </>
        )}
      </button>
    </div>
  );
}

/** API key path: inline credential form. */
function ApiKeySetup({ data, onDone }: { data: ConnectorSetupInfo; onDone: () => void }) {
  const fields = data.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map(f => [f.key, ""]))
  );
  const [status, setStatus] = useState<SetupStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const allFilled = fields.every(f => values[f.key]?.trim());

  const submit = async () => {
    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/connectors/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorType: data.connectorType, credentials: values }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error ?? "Failed to save connector");
        setStatus("error");
        return;
      }
      setStatus("done");
      onDone();
    } catch {
      setErrorMsg("Network error — please try again");
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-emerald-600 dark:text-emerald-400">
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        {data.displayName} connected — data will start flowing shortly
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fields.map(field => (
        <div key={field.key}>
          <label className="block text-[11px] font-medium text-muted mb-1">{field.label}</label>
          <input
            type={field.secret ? "password" : "text"}
            value={values[field.key] ?? ""}
            onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
            placeholder={field.placeholder}
            autoComplete={field.secret ? "new-password" : undefined}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>
      ))}

      {errorMsg && (
        <p className="text-xs text-red-500">{errorMsg}</p>
      )}

      <button
        onClick={submit}
        disabled={!allFilled || status === "submitting"}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "submitting" ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Saving…
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            Save & Connect
          </>
        )}
      </button>
    </div>
  );
}

/** Main ConnectorSetupCard — shown inline in Copilot chat after "connect [service]" command. */
export function ConnectorSetupCard({ data }: { data: ConnectorSetupInfo }) {
  const [connected, setConnected] = useState(false);

  return (
    <div className="my-3 rounded-xl border border-border bg-surface/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-surface">
        <svg className="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Connect {data.displayName}</p>
          {data.description && (
            <p className="text-[11px] text-muted truncate">{data.description}</p>
          )}
        </div>
        {connected && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            Connected
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {connected ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            {data.displayName} is now connected. Data ingestion will begin shortly.
          </div>
        ) : data.authMethod === "apikey" ? (
          <ApiKeySetup data={data} onDone={() => setConnected(true)} />
        ) : (
          <OAuthSetup data={data} onDone={() => setConnected(true)} />
        )}
      </div>
    </div>
  );
}
