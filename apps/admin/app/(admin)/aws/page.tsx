export const dynamic = "force-dynamic";

// AWS SDK calls require credentials. We display config info + guide the admin.
// Full CloudWatch metrics would require runtime AWS SDK calls.

const AWS_SERVICES = [
  {
    name: "AWS Amplify",
    resource: "brainos-platform",
    region: "us-east-1",
    status: "running",
    description: "Next.js SSR app — auto-deploys from main branch",
    link: "https://us-east-1.console.aws.amazon.com/amplify/apps",
  },
  {
    name: "AWS S3",
    resource: "brainos-uploads",
    region: "us-east-1",
    status: "running",
    description: "Document uploads, exported files, AI artifacts",
    link: "https://us-east-1.console.aws.amazon.com/s3",
  },
  {
    name: "AWS CloudWatch",
    resource: "brainos-logs",
    region: "us-east-1",
    status: "running",
    description: "Lambda execution logs, error tracking, performance metrics",
    link: "https://us-east-1.console.aws.amazon.com/cloudwatch",
  },
  {
    name: "AWS IAM",
    resource: "amplify-brainos-*",
    region: "global",
    status: "configured",
    description: "Amplify execution role — S3 + CloudWatch permissions",
    link: "https://console.aws.amazon.com/iam",
  },
];

const SCALING_GUIDE = [
  { item: "Amplify Lambda Memory", current: "1024 MB", action: "Update amplify.yml → increase Lambda memory in build settings" },
  { item: "S3 Storage Class", current: "Standard", action: "Migrate older uploads to S3 Intelligent-Tiering to reduce costs" },
  { item: "CloudFront Cache TTL", current: "Immutable for static", action: "Add custom error page for 503 → redirect to maintenance page" },
  { item: "Concurrency Limit", current: "Amplify default", action: "Add Lambda reserved concurrency to prevent cold start spikes" },
];

export default function AWSPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">AWS Resources</h1>
        <p className="text-[#888880] text-sm">Deployed AWS infrastructure overview and scaling guidance</p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {AWS_SERVICES.map((svc) => (
          <a
            key={svc.name}
            href={svc.link}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#161616] border border-[#2a2a2a] hover:border-[#ea580c]/30 rounded-xl p-6 block transition-all group"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-white group-hover:text-[#ea580c] transition-colors">
                  {svc.name}
                </p>
                <p className="text-xs text-[#888880] mt-0.5 font-mono">{svc.resource}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={[
                  "w-2 h-2 rounded-full",
                  svc.status === "running" ? "bg-[#22c55e]" : "bg-[#f59e0b]"
                ].join(" ")} />
                <span className="text-xs text-[#888880]">{svc.status}</span>
              </div>
            </div>
            <p className="text-xs text-[#888880]">{svc.description}</p>
            <div className="flex items-center gap-1 mt-3">
              <span className="text-xs text-[#555]">{svc.region}</span>
              <span className="text-xs text-[#333]">·</span>
              <span className="text-xs text-[#ea580c] group-hover:text-[#fb923c] transition-colors">
                Open Console →
              </span>
            </div>
          </a>
        ))}
      </div>

      {/* Scaling guide */}
      <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-white mb-4">Scaling Recommendations</h2>
        <div className="space-y-3">
          {SCALING_GUIDE.map((item) => (
            <div key={item.item} className="py-3 border-b border-[#1e1e1e] last:border-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-white">{item.item}</p>
                <span className="text-xs font-mono bg-[#1a1a1a] text-[#888880] px-2 py-0.5 rounded">
                  {item.current}
                </span>
              </div>
              <p className="text-xs text-[#888880]">{item.action}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "View Lambda Logs", href: "https://us-east-1.console.aws.amazon.com/cloudwatch/home#logsV2:log-groups" },
            { label: "Amplify Build History", href: "https://us-east-1.console.aws.amazon.com/amplify/apps" },
            { label: "S3 Bucket Usage", href: "https://us-east-1.console.aws.amazon.com/s3" },
            { label: "IAM Roles", href: "https://console.aws.amazon.com/iam/home#/roles" },
            { label: "CloudFront Distributions", href: "https://us-east-1.console.aws.amazon.com/cloudfront" },
            { label: "Cost Explorer", href: "https://us-east-1.console.aws.amazon.com/cost-management/home#/cost-explorer" },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#ea580c]/30 rounded-lg text-xs text-[#888880] hover:text-white transition-colors"
            >
              {link.label}
              <svg className="w-3 h-3 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
