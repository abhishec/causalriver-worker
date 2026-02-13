"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { SITE, NAV_LINKS } from "@/lib/constants";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Determine if a link should use <a> (for hash links on homepage) or <Link>
  function renderNavLink(
    link: (typeof NAV_LINKS)[number],
    className: string,
    onClick?: () => void
  ) {
    const isExternal = "external" in link && link.external;
    const isHashLink = link.href.includes("#");
    const isActive =
      !isHashLink && !isExternal && pathname === link.href;

    const activeClass = isActive
      ? "text-foreground font-medium"
      : "text-muted";

    if (isExternal) {
      return (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`${className} ${activeClass}`}
          onClick={onClick}
        >
          {link.label}
        </a>
      );
    }

    // Hash links and internal routes both use Link for proper SPA navigation
    return (
      <Link
        key={link.label}
        href={link.href}
        className={`${className} ${activeClass}`}
        onClick={onClick}
      >
        {link.label}
      </Link>
    );
  }

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
            <span className="text-lg font-bold text-accent">N</span>
          </div>
          <span className="text-lg font-semibold">{SITE.name}</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) =>
            renderNavLink(
              link,
              "text-sm transition-colors hover:text-foreground"
            )
          )}
          <a
            href={SITE.platform}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-dark"
          >
            Platform Login
          </a>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <svg className="h-6 w-6 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border bg-background px-6 py-4 md:hidden">
          {NAV_LINKS.map((link) =>
            renderNavLink(
              link,
              "block py-2 text-sm transition-colors hover:text-foreground",
              () => setMobileOpen(false)
            )
          )}
          <a
            href={SITE.platform}
            className="mt-3 block rounded-lg bg-accent px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-accent-dark"
          >
            Platform Login
          </a>
        </div>
      )}
    </nav>
  );
}
