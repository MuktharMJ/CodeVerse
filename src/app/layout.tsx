import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "CODEVERSE — Navigate the universe of software";
const description = "An interactive 3D atlas of the software ecosystem. Explore technologies, real GitHub/npm signals, dependency manifests, and explainable recommendations across Web, Backend, Database, and AI constellations.";

export const metadata: Metadata = {
  metadataBase: new URL("https://codeverse.example"),
  title: { default: title, template: "%s · CODEVERSE" },
  description,
  applicationName: "CODEVERSE",
  keywords: ["codeverse", "software atlas", "technology graph", "github", "npm", "ecosystem", "dependencies", "next.js", "react", "postgresql"],
  authors: [{ name: "CODEVERSE" }],
  creator: "CODEVERSE",
  publisher: "CODEVERSE",
  category: "technology",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    title,
    description,
    siteName: "CODEVERSE",
    locale: "en_US",
    images: [{ url: "/icon", alt: "CODEVERSE — Navigate the universe of software" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/icon"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#060910",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
