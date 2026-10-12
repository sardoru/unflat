import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const site =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

const description =
  "Drop in a flat-pack furniture manual. Claude reads every page and Unflat turns it into a step-by-step 3D build you can turn, replay and share.";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "Unflat · flat-pack manuals in 3D", template: "%s · Unflat" },
  description,
  applicationName: "Unflat",
  openGraph: { type: "website", siteName: "Unflat", title: "Unflat · flat-pack manuals in 3D", description, url: "/" },
  twitter: { card: "summary_large_image", title: "Unflat · flat-pack manuals in 3D", description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c0d0f" },
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
