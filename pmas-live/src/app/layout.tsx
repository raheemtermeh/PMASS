import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Vazirmatn } from "next/font/google";
import { AppProviders } from "@/core/providers/AppProviders";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
});

// Variable axis (100–900) so Persian headings can go heavier than the Latin scale.
const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PMAS Live — Production Control Center",
  description: "Real business flow for PMAS with authentication and live data.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const appBootScript = `
(function(){
  try {
    var t = localStorage.getItem("pmas-theme");
    if (t !== "light" && t !== "dark") {
      t = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
  try {
    var l = localStorage.getItem("pmas-live-lang");
    l = l === "fa" ? "fa" : "en";
    document.documentElement.setAttribute("lang", l);
    document.documentElement.setAttribute("dir", l === "fa" ? "rtl" : "ltr");
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${inter.variable} ${jetbrainsMono.variable} ${vazirmatn.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: appBootScript }} />
      </head>
      <body className="flex h-screen overflow-hidden bg-surface-container text-on-surface">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
