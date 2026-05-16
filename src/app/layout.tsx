import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "日麻牌谱解析助手",
  description: "导入雀魂牌谱链接并生成结构化 AI 复盘。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
