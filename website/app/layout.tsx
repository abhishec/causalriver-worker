import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "NexusBrain - Causal Intelligence Engine for AI Agents",
    template: "%s | NexusBrain",
  },
  description:
    "A causal intelligence engine that gives AI agents persistent, self-improving memory. 8 statistical methods, zero runtime dependencies, TypeScript. Benchmarked against ICLR 2025 datasets.",
  keywords: [
    "causal intelligence",
    "AI memory",
    "Granger causality",
    "TypeScript SDK",
    "AI agents",
    "causal discovery",
    "organizational intelligence",
    "NexusBrain",
  ],
  authors: [{ name: "Monetize Organisation" }],
  openGraph: {
    title: "NexusBrain - Causal Intelligence Engine for AI Agents",
    description:
      "Give your AI agents a brain that remembers, discovers cause-and-effect, and gets smarter without retraining.",
    url: "https://usebrainos.com",
    siteName: "NexusBrain",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NexusBrain - Causal Intelligence Engine for AI Agents",
    description:
      "Give your AI agents a brain that remembers, discovers cause-and-effect, and gets smarter without retraining.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Navbar />
        <main className="min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
