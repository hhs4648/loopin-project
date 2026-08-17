-- ---------------------------------------------------------------------------
-- 점수는 **서버가 계산한다.**
--
-- 지금까지 `attempts`의 `score`·`correct_count`·`answered_count`·`progress_percent`는
-- 학생 앱이 계산해서 올리는 값이었다. `attempts_update_self` 정책은 「자기 회차면
-- 수정 가능」이라, 마음먹으면 개발자 도구로 `score = 100`을 그대로 써 넣을 수 있었다.
-- 채점이 전부 브라우저에서 일어나는 구조의 필연적 결과다.
--
-- 여기서는 **집계값을 답안 표에서 다시 계산해 덮어쓴다.** 클라이언트가 뭘 보내든
-- 무시된다. 거절이 아니라 덮어쓰기라, 예전 버전 앱이 남아 있어도 깨지지 않는다.
--
-- **남는 구멍:** 답안 한 줄의 `is_correct`는 여전히 앱이 정한다. 즉 「틀린 걸 맞다고
-- 올리는」 것까지는 못 막는다. 그걸 막으려면 문항별 정답을 서버가 알고 채점해야 하는데,
-- 유형마다 정답 형식이 달라(`:match` `:choice` `:spell` `:ox` `:ox:fix` …) 스냅샷 JSON을
-- 해석하는 채점기를 DB에 다시 만들어야 한다. 그건 별도 작업이다.
-- 적어도 **점수를 한 번에 조작하는 것**은 여기서 막힌다.
-- ---------------------------------------------------------------------------

create or replace function public.attempts_recompute_scores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answered integer;
  v_correct integer;
  v_total integer;
begin
  select
    count(*),
    count(*) filter (where is_correct is true)
  into v_answered, v_correct
  from public.answers
  where attempt_id = new.id;

  -- 출제 문항 수는 앱이 알려주는 값을 쓰되, 실제로 푼 수보다 작을 수는 없다
  v_total := greatest(coalesce(new.question_total, 0), v_answered);

  new.answered_count := v_answered;
  new.correct_count := v_correct;
  new.question_total := v_total;
  new.progress_percent := case
    when v_total > 0 then least(100, round(v_answered::numeric * 100 / v_total))
    else 0
  end;
  -- 점수는 **푼 문항 기준**. 아직 안 푼 회차는 null (완료 전에는 점수가 없다)
  new.score := case
    when v_answered > 0 then round(v_correct::numeric * 100 / v_answered)
    else null
  end;

  return new;
end;
$$;

drop trigger if exists attempts_enforce_scores on public.attempts;
create trigger attempts_enforce_scores
  before insert or update on public.attempts
  for each row execute function public.attempts_recompute_scores();

-- ---------------------------------------------------------------------------
-- 답안이 들어오면 부모 회차를 건드려 위 트리거가 다시 돌게 한다.
-- 이게 없으면 앱이 `attempts`를 따로 갱신하지 않는 한 집계가 멈춘다.
-- ---------------------------------------------------------------------------

create or replace function public.answers_touch_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt uuid := coalesce(new.attempt_id, old.attempt_id);
begin
  update public.attempts
     set updated_at = now()
   where id = v_attempt;
  return null;
end;
$$;

drop trigger if exists answers_sync_attempt on public.answers;
create trigger answers_sync_attempt
  after insert or update or delete on public.answers
  for each row execute function public.answers_touch_attempt();
