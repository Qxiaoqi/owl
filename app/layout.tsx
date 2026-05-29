import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Owl",
  description: "Local JD-grounded interview analysis workspace",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
