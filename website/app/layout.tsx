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
    default: "NexusBrain - The Causal Memory for Organisations | usebrainos.com",
    template: "%s | NexusBrain",
  },
  description:
    "NexusBrain is the causal memory for organisations — a deep knowledge system that perceives your data, discovers cause-and-effect, and transforms how your organisation works.",
  keywords: [
    "causal memory",
    "organisational intelligence",
    "deep knowledge system",
    "causal discovery",
    "AI agents",
    "cause and effect",
    "agent as a service",
    "NexusBrain",
    "usebrainos",
  ],
  authors: [{ name: "Monetize Organisation" }],
  openGraph: {
    title: "NexusBrain - The Causal Memory for Organisations",
    description:
      "The causal memory for organisations — a deep knowledge system that perceives your data, discovers cause-and-effect, and transforms how your organisation works.",
    url: "https://usebrainos.com",
    siteName: "NexusBrain",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NexusBrain - The Causal Memory for Organisations",
    description:
      "The causal memory for organisations — a deep knowledge system that perceives your data, discovers cause-and-effect, and transforms how your organisation works.",
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
