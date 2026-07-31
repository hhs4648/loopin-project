import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "루핀 교사",
  description: "루핀 교사용 — 캘린더 · 반 홈",
};

export default function TeacherLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-white text-[#15171A]">{children}</div>
  );
}
