export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center" role="status" aria-label="Loading AI Worker">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin" aria-hidden="true" />
        <p className="text-sm text-white/30">Loading AI Worker...</p>
      </div>
    </div>
  );
}
