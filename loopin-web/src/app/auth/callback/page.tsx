import { TeacherAuthCallback } from "@/components/teacher/TeacherAuthCallback";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "학습 로그인",
  description: "학습 선생님 로그인",
};

export default function AuthCallbackPage() {
  return <TeacherAuthCallback />;
}
