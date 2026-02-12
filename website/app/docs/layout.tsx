import { DocsSidebar } from "@/components/layout/DocsSidebar";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-7xl gap-8 px-6 pt-24">
      <DocsSidebar />
      <article className="min-w-0 flex-1 py-6">
        <div className="prose prose-invert max-w-none prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:text-muted prose-a:text-accent-light prose-code:text-emerald-400 prose-pre:bg-surface prose-pre:border prose-pre:border-border">
          {children}
        </div>
      </article>
    </div>
  );
}
