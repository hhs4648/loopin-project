-- ---------------------------------------------------------------------------
-- 회차별 최고 연속 정답(콤보)을 attempts에 남긴다.
--
-- 학생 앱은 풀이 중 콤보를 러너 컴포넌트 메모리로만 들고 있어서, 완료 화면을 벗어나면
-- 사라졌다. 맵에서 완료된 성을 다시 열면 점수는 attempts에서 복원되는데 콤보만 0으로
-- 떨어져 「연속 정답」 배지가 사라지는 문제가 있었다.
--
-- 재도전은 새 attempt를 만들므로(startOrResumeAttempt forceNew) 이 값은 자연히
-- **그 회차 한 판의 최고 콤보**가 된다. 학생의 역대 최고 기록이 아니다.
-- 콤보 규칙 자체는 학생앱 `components/exercise/combo.ts` 참고.
-- ---------------------------------------------------------------------------

alter table public.attempts
  add column if not exists max_combo integer not null default 0;

alter table public.attempts
  drop constraint if exists attempts_max_combo_nonnegative;
alter table public.attempts
  add constraint attempts_max_combo_nonnegative
  check (max_combo >= 0);
