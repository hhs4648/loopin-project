import { redirect } from "next/navigation";

/** 교사 웹 첫 화면 = 캘린더 홈 */
export default function Home() {
  redirect("/teacher");
}
