import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode | { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-4 text-center", className)}>
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-surface-hover flex items-center justify-center mb-4 text-muted">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-medium mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-muted max-w-sm">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          {typeof action === "object" && action !== null && "label" in action ? (
            <button
              onClick={(action as { label: string; onClick: () => void }).onClick}
              className="px-4 py-2 rounded-lg bg-accent/10 text-accent text-sm hover:bg-accent/20 transition-colors"
            >
              {(action as { label: string; onClick: () => void }).label}
            </button>
          ) : (
            action
          )}
        </div>
      )}
    </div>
  );
}
