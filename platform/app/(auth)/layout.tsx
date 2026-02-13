export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left — Brain Animation */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center bg-gradient-to-br from-background via-surface to-background relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-brain" />

        {/* Neural network dots */}
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-accent/20 flex items-center justify-center glow-accent">
              <span className="text-5xl font-bold text-accent">N</span>
            </div>
            {/* Orbiting dots */}
            <div className="absolute -top-2 -right-2 w-3 h-3 rounded-full bg-accent/60 brain-pulse" />
            <div className="absolute -bottom-1 -left-3 w-2 h-2 rounded-full bg-accent-light/40 brain-pulse" style={{ animationDelay: "1s" }} />
            <div className="absolute top-1/2 -right-6 w-2 h-2 rounded-full bg-success/50 brain-pulse" style={{ animationDelay: "0.5s" }} />
          </div>

          <h1 className="text-3xl font-bold text-foreground">NexusBrain</h1>
          <p className="text-muted text-center max-w-xs">
            A living brain for your apps — it perceives, reasons, dreams, and gets smarter every day.
          </p>

          {/* Live stats */}
          <div className="flex gap-6 mt-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-accent">11</div>
              <div className="text-xs text-muted">Brain Regions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success">15</div>
              <div className="text-xs text-muted">Causal Methods</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning">118</div>
              <div className="text-xs text-muted">Training Packs</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right — Auth Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}
