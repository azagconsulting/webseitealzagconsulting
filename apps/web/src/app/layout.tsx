import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

import { AuthProvider } from "@/components/auth-provider";
import { CookieConsent } from "@/components/cookie-consent";
import { NotificationProvider } from "@/components/notifications/notifications-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { TrackingProvider } from "@/components/tracking-provider";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Arcto Labs v1 - by Alzag Consulting",
  description:
    "Arcto Labs v1 ist die reduzierte CRM-Oberfläche mit Landingpage, Dashboard und Einstellungen.",
  metadataBase: new URL("https://arcto-crm.example"),
  openGraph: {
    title: "Arcto Labs v1 - by Alzag Consulting",
    description: "Der Startpunkt für dein zukünftiges CRM-System",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={`${fontSans.variable} antialiased`}>
        <ThemeProvider>
          <Suspense fallback={null}>
            <CookieConsent />
            <TrackingProvider />
          </Suspense>
          <NotificationProvider>
            <Suspense fallback={null}>
              <AuthProvider>{children}</AuthProvider>
            </Suspense>
          </NotificationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
