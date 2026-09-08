/**
 * 저장 모듈 ↔ 워크스페이스 동기화 사이의 **순환 import를 끊는** 얇은 진입점.
 * `school-brand` 등이 동기화 본체를 직접 가져가면 로더가 서로를 물게 된다.
 */
let timer: number | null = null;

export function scheduleTeacherWorkspaceSync(): void {
  if (typeof window === "undefined") return;
  if (timer != null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void import("@/lib/sync/teacher-workspace").then((mod) => {
      void mod.syncTeacherWorkspaceRemote();
    });
  }, 600);
}
