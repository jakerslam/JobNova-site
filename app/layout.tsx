import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Jobnova | Career Dashboard",
  description:
    "A Figma-informed Next.js internship project for an AI-powered job application dashboard.",
  openGraph: {
    title: "Jobnova | Career Dashboard",
    description:
      "Matched jobs, recruiter discovery, resume support, and AI mock interview workflows in one dashboard.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${inter.className}`}>{children}</body>
    </html>
  );
}
