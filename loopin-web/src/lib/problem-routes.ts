export type ProblemsView = "submit" | "saved";

export const PROBLEMS_VIEWS = [
  { id: "submit" as const, label: "문제 제출", href: "/teacher/problems" },
  {
    id: "saved" as const,
    label: "사용자 지정 과제 제출",
    href: "/teacher/problems/saved",
  },
] as const;

export function problemsViewHref(view: ProblemsView): string {
  return view === "saved" ? "/teacher/problems/saved" : "/teacher/problems";
}
