import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SafiRoute — Every delivery. Verified.",
  description: "Safisana Ghana digital waybill and proof of delivery.",
  icons: { icon: "/safiroute-icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
