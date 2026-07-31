-- ---------------------------------------------------------------------------
-- 칭찬 캘린더 통과("😊 통과") / 아쉬움("😐 아쉬움") 판정 기준 점수를
-- 선생님이 「설정」에서 바꿀 수 있도록 profiles(teacher)에 컬럼 추가.
-- 학생 앱은 자신이 속한 반의 담당 선생님 profiles 행에서 이 값을 읽어
-- 칭찬 캘린더 상태(pass/regrettable)를 계산한다 (기본값 70).
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists praise_pass_threshold integer not null default 70;

alter table public.profiles
  drop constraint if exists profiles_praise_pass_threshold_range;
alter table public.profiles
  add constraint profiles_praise_pass_threshold_range
  check (praise_pass_threshold between 0 and 100);

-- 학생이 자신이 가입한 반의 담당 선생님 profiles 행을 읽을 수 있도록 허용
-- (기존 profiles_select_own_or_teacher 는 반대 방향 — 선생님이 학생을 보는 것만 허용했음).
drop policy if exists profiles_select_teacher_by_student on public.profiles;
create policy profiles_select_teacher_by_student on public.profiles
  for select using (
    exists (
      select 1
      from public.classes c
      where c.teacher_id = profiles.id
        and public.is_enrolled_in_class(c.id)
    )
  );
