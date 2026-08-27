import { TeacherLoginPanel } from "@/components/teacher/TeacherLoginPanel";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "학습 로그인",
  description: "학습 선생님 로그인",
};

export default function LoginPage() {
  return <TeacherLoginPanel />;
}
