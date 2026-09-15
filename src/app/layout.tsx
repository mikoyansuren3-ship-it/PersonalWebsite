import type { Metadata } from "next";
import { Outfit, Work_Sans } from "next/font/google";
import GlowBackground from "@/components/layout/GlowBackground";
import Navbar from "@/components/layout/Navbar";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Portfolio — Your Name",
  description: "Personal portfolio and resume. Software engineer, creative developer, problem solver.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${workSans.variable} scroll-smooth`}>
      <body className="min-h-screen bg-[#09090b] text-white antialiased">
        <GlowBackground />
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
