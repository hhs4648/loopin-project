-- ---------------------------------------------------------------------------
-- 학생이 **같은 문항을 다시 답할 수 있게** 한다.
--
-- 학생앱은 답안을 `client_answer_id` 기준 upsert로 올린다. 예전에는 그 id에
-- `Date.now()`가 섞여 있어서 매번 새 행이 INSERT 됐다 — 그래서 UPDATE 정책이
-- 없어도 아무 문제가 없었다. 그런데 그 방식은 한 문항에 행이 계속 쌓여서,
-- 「한 번이라도 틀린 문항」이 영영 오답으로 남고(=「틀린문제만」이 전체를 다시 냄)
-- 푼 문항 수·점수도 부풀었다. 그래서 id를 `attempt:question`으로 고정했다.
--
-- 고정하고 나면 재응답은 INSERT가 아니라 **ON CONFLICT DO UPDATE**로 간다.
-- UPDATE 정책이 없으면 RLS가 그 경로를 막아서 답안이 조용히 유실된다.
--
-- 조건은 INSERT 정책과 같다 — **자기 attempt의 답안만**.
-- ---------------------------------------------------------------------------

drop policy if exists answers_update_self on public.answers;
create policy answers_update_self on public.answers
  for update using (
    exists (
      select 1 from public.attempts t
      where t.id = answers.attempt_id
        and t.student_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.attempts t
      where t.id = answers.attempt_id
        and t.student_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- upsert가 걸리려면 충돌 대상 컬럼에 유니크 제약이 있어야 한다.
-- 001에서 `unique (client_answer_id)`로 이미 만들어 두었지만, 없을 때만 만든다.
-- (이미 있으면 예외를 삼킨다 — 이름·컬럼 조합을 직접 비교하면 `conkey`가
--  int2vector라 배열 비교에서 타입 오류가 나기 쉽다.)
-- ---------------------------------------------------------------------------

do $$
begin
  alter table public.answers
    add constraint answers_client_answer_id_key unique (client_answer_id);
exception
  when duplicate_table then null;
  when duplicate_object then null;
  when unique_violation then
    raise exception
      'answers.client_answer_id에 중복이 있어 유니크 제약을 만들 수 없습니다. '
      '중복 행을 정리한 뒤 다시 실행하세요.';
end $$;
