import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode | { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  className?: string;
  /** Visual variant — default is standard centered, "card" wraps in a card shell */
  variant?: "default" | "card";
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  variant = "default",
}: EmptyStateProps) {
  const inner = (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-6 text-center",
        variant === "card" &&
          "rounded-2xl bg-card border border-border-subtle shadow-[var(--shadow-card)] overflow-hidden relative",
        className
      )}
    >
      {/* Subtle gradient glow behind icon */}
      {variant === "card" && (
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-accent/[0.03] to-transparent" />
      )}

      {icon && (
        <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 flex items-center justify-center mb-5 shadow-[0_0_20px_rgba(124,108,240,0.06)]">
          <div className="text-accent">{icon}</div>
        </div>
      )}

      <h3 className="text-sm font-semibold mb-1.5 tracking-tight">{title}</h3>

      {description && (
        <p className="text-xs text-muted leading-relaxed max-w-xs">{description}</p>
      )}

      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 mt-5">
          {action && (
            <>
              {typeof action === "object" && action !== null && "label" in action ? (
                <button
                  onClick={(action as { label: string; onClick: () => void }).onClick}
                  className="px-4 py-2 rounded-xl bg-accent text-accent-foreground text-xs font-medium hover:bg-accent-dark transition-all shadow-[var(--shadow-sm)]"
                >
                  {(action as { label: string; onClick: () => void }).label}
                </button>
              ) : (
                action
              )}
            </>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="px-4 py-2 rounded-xl bg-surface border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-all"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );

  return inner;
}
