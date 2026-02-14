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
    default: "NexusBrain - A Living Brain for Your Apps | usebrainos.com",
    template: "%s | NexusBrain",
  },
  description:
    "A self-improving causal intelligence engine with 24 brain regions. It perceives, reasons, dreams, and gets smarter every day. Connect your app — it inherits a brain.",
  keywords: [
    "causal intelligence",
    "AI memory",
    "living brain",
    "self-improving AI",
    "AI agents",
    "causal discovery",
    "brain infrastructure",
    "NexusBrain",
    "usebrainos",
  ],
  authors: [{ name: "Monetize Organisation" }],
  openGraph: {
    title: "NexusBrain - A Living Brain for Your Apps",
    description:
      "A self-improving causal intelligence engine. It perceives, reasons, dreams, and gets smarter every day. Connect your app — it inherits a brain.",
    url: "https://usebrainos.com",
    siteName: "NexusBrain",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NexusBrain - A Living Brain for Your Apps",
    description:
      "A self-improving causal intelligence engine. It perceives, reasons, dreams, and gets smarter every day. Connect your app — it inherits a brain.",
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
