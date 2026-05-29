// @ts-nocheck
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
    default: "Exomagram — Transparencia total del trabajo",
    template: "%s | Exomagram",
  },
  description:
    "Ve exactamente qué hace cada miembro de tu equipo, hora por hora. Transparencia radical para equipos modernos.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://exomagram.com"),
  openGraph: {
    title: "Exomagram — Transparencia total del trabajo",
    description: "Transparencia radical para equipos modernos.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col scanlines vignette">
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.add('dark');localStorage.setItem('theme','dark');`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
