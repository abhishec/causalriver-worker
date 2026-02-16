"use client";

interface BrainPulseProps {
  status: "active" | "training" | "sleeping" | "error";
  lastTrainedAt?: string;
  brainAge?: number;
  nextTrainingIn?: string;
}

const STATUS_CONFIG = {
  active: { label: "Brain Active", color: "bg-success", textColor: "text-success" },
  training: { label: "Training in Progress", color: "bg-accent", textColor: "text-accent" },
  sleeping: { label: "Brain Sleeping", color: "bg-warning", textColor: "text-warning" },
  error: { label: "Error", color: "bg-danger", textColor: "text-danger" },
};

export function BrainPulse({ status, lastTrainedAt, brainAge, nextTrainingIn }: BrainPulseProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="rounded-xl bg-card border border-border-subtle p-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Brain icon with pulse */}
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full ${config.color} brain-pulse`} />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${config.textColor}`}>{config.label}</span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-muted">
              {lastTrainedAt && <span>Last trained: {lastTrainedAt}</span>}
              {brainAge !== undefined && <span>Brain age: {brainAge} days</span>}
              {nextTrainingIn && <span>Next: {nextTrainingIn}</span>}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="hidden md:flex items-center gap-6">
          <div className="text-center">
            <div className="text-lg font-bold text-accent">11</div>
            <div className="text-[10px] text-muted">Regions</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-success">7</div>
            <div className="text-[10px] text-muted">Layers</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-warning">15</div>
            <div className="text-[10px] text-muted">Methods</div>
          </div>
        </div>
      </div>
    </div>
  );
}
