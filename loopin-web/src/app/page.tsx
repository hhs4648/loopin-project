import { redirect } from "next/navigation";

/** 교사 웹 첫 화면 = 로그인 */
export default function Home() {
  redirect("/login");
}
