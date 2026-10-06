import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "随手传 · 设备互联实验室",
  description: "免安装设备直传原型与方案比较",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
