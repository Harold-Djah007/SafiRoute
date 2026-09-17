import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";
import "./sales-mobile.css";
import "./sales-mobile-polish.css";
import "./paper-waybill.css";

export const metadata: Metadata = {
  title: "SafiRoute — Every delivery. Verified.",
  description: "Safisana Ghana digital sales waybills: offline-capable, signed, geo-stamped, PDF and QR verified.",
  applicationName: "SafiRoute",
  icons: { icon: "/safiroute-icon.png", apple: "/safiroute-icon.png" },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "SafiRoute",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0F5C2E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
