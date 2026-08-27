import type { Metadata } from "next";
import { LEGACY_BRAND_STORAGE_SCRIPT } from "@/lib/legacy-brand-storage";
import { Geist_Mono } from "next/font/google";
import "pretendard/dist/web/static/pretendard.css";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "학습",
  description: "중학교 영어 내신 학습 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* 구 브랜드 저장소 키 이전 — 앱 번들보다 먼저 돌아야 한다 */}
        <script
          dangerouslySetInnerHTML={{ __html: LEGACY_BRAND_STORAGE_SCRIPT }}
        />
        {children}
      </body>
    </html>
  );
}
