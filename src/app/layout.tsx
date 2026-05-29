import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
 variable:"--font-geist-sans",
 subsets: ["latin"],
});

const geistMono = Geist_Mono({
 variable:"--font-geist-mono",
 subsets: ["latin"],
});

export const metadata: Metadata = {
 title: {
 default:"Exomagram — Vigilancia Total del Trabajo",
 template:"%s | Exomagram",
 },
 description:
"Cada hora queda registrada. Cada excusa queda expuesta. Vigilancia total para equipos que exigen resultados.",
 metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ||"https://exomagram.com"),
 openGraph: {
 title:"Exomagram — Vigilancia Total del Trabajo",
 description:"Cada hora queda registrada. Cada excusa queda expuesta.",
 type:"website",
 siteName:"Exomagram",
 locale:"es_MX",
 },
 twitter: {
 card:"summary_large_image",
 title:"Exomagram — Vigilancia Total del Trabajo",
 description:"Cada hora queda registrada. Cada excusa queda expuesta.",
 },
 robots: {
 index: false,
 follow: false,
 },
};

export default function RootLayout({
 children,
}: Readonly<{
 children: React.ReactNode;
}>) {
 return (
 <html
 lang="es"className={`${geistSans.variable} ${geistMono.variable} h-full dark`}
 >
 <head>
 <link rel="manifest"href="/manifest.json"/>
 <link rel="icon"href="/favicon.svg"type="image/svg+xml"/>
 <meta name="theme-color"content="#060810"/>
 <meta name="apple-mobile-web-app-capable"content="yes"/>
 <meta name="apple-mobile-web-app-status-bar-style"content="black-translucent"/>
 <link rel="apple-touch-icon"href="/icon-192.svg"/>
 <meta name="viewport"content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
 </head>
 <body className="min-h-full flex flex-col">
 {children}
 </body>
 </html>
 );
}
