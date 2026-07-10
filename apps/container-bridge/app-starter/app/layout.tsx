import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trace App",
  description: "Generated in a Trace app session",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
