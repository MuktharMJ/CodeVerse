import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CODEVERSE | Navigate the universe of software",
  description: "An interactive atlas of the software ecosystem. Discover the technologies and connections shaping the world of code.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#060910" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
