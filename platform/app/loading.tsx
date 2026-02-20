export default function GlobalLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
        <div className="w-2 h-2 rounded-full bg-accent animate-pulse [animation-delay:150ms]" />
        <div className="w-2 h-2 rounded-full bg-accent animate-pulse [animation-delay:300ms]" />
      </div>
    </div>
  );
}
