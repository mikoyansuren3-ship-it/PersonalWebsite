import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Newsreader } from "next/font/google";
import IntroController from "@/components/intro/IntroController";
import Footer from "@/components/site/Footer";
import Nav from "@/components/site/Nav";
import ScrollReveal from "@/components/site/ScrollReveal";
import { site } from "@/content/site";
import { gateScript } from "@/lib/intro/gate";
import "./globals.css";

const display = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--nf-display",
  display: "swap",
});

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--nf-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--nf-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: site.meta.title,
  description: site.meta.description,
};

export const viewport: Viewport = {
  themeColor: "#f7f3ec",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      // The gate script below sets data-intro before hydration.
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: gateScript() }} />
      </head>
      <body>
        <IntroController />
        <Nav />
        <main id="main">{children}</main>
        <Footer />
        <ScrollReveal />
      </body>
    </html>
  );
}