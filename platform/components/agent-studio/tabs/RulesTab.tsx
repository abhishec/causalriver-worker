"use client";

interface RulesTabProps {
  rules: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}

export function RulesTab({ rules, onChange, readOnly }: RulesTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">
          Agent Rules & Constraints
        </label>
        <p className="text-[10px] text-muted mb-2">
          Define guardrails, constraints, and specific rules this agent must follow. These are enforced during execution.
        </p>
        <textarea
          value={rules}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Examples:\n- Never suggest deployment without running tests first\n- Always check for accessibility violations in React components\n- Flag any function longer than 50 lines\n- Require error boundaries around async components\n- Do not auto-approve changes to authentication logic`}
          className="w-full h-48 px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted/50 font-mono text-xs leading-relaxed"
          readOnly={readOnly}
        />
      </div>

      <div className="bg-accent/5 border border-accent/10 rounded-lg px-4 py-3">
        <h4 className="text-xs font-medium text-accent mb-1">How rules work</h4>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Rules are injected into the agent&apos;s system prompt alongside the persona. They act as hard constraints
          during the L1-L30 cognitive cycle. The brain&apos;s L11 red-team layer validates outputs against these
          rules and lowers confidence if violations are detected.
        </p>
      </div>
    </div>
  );
}
