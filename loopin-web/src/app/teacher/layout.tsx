import type { Metadata } from "next";
import { StartGuidePanel } from "@/components/teacher/StartGuidePanel";
import { TeacherAuthGate } from "@/components/teacher/TeacherAuthGate";

export const metadata: Metadata = {
  title: "학습 교사",
  description: "학습 교사용 — 캘린더 · 반 홈",
};

export default function TeacherLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-white text-[#15171A]">
      <TeacherAuthGate>
        {children}
        {/* 처음 들어온 선생님용 시작 가이드 — 다 끝내면 스스로 사라진다 */}
        <StartGuidePanel />
      </TeacherAuthGate>
    </div>
  );
}
