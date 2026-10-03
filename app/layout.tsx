import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { ServiceWorker } from "@/components/pwa/service-worker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: "italic",
});

const description =
  "A live clipboard between your devices. Paste on your laptop, copy on your phone — no more texting yourself.";

export const metadata: Metadata = {
  metadataBase: new URL("https://linkyourdude.vercel.app"),
  title: {
    default: "Link Your Dude — paste here, copy there",
    template: "%s · Link Your Dude",
  },
  description,
  applicationName: "Link Your Dude",
  appleWebApp: {
    capable: true,
    title: "Link Your Dude",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: "Link Your Dude",
    description,
    url: "/",
    siteName: "Link Your Dude",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b10" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
