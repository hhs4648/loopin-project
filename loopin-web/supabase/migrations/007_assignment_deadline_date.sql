-- ---------------------------------------------------------------------------
-- 과제 마감 **날짜**를 학생 앱까지 내려보낸다.
--
-- 지금까지 서버에는 `lesson_date`(수업일)와 `deadline_time`(HH:MM)만 있었다.
-- 교사 화면은 마감 날짜를 따로 정할 수 있고("다음 수업 전까지" 포함) 로컬에는
-- `deadlineDate` / `deadlineUntilNextLesson`으로 들고 있는데, **보낼 컬럼이 없어서**
-- 학생 앱은 그걸 알 방법이 없었다. 그래서 학생 화면에 마감을 표시하려면 수업일을
-- 마감일인 척 보여줘야 했다 — 둘이 다른 과제에서는 그냥 거짓말이 된다.
--
-- 006과 같은 이유로 컬럼을 올린다. 둘 다 nullable이라 기존 행은 그대로 두면 되고,
-- 읽는 쪽은 값이 없으면 `lesson_date`로 대체한다.
-- ---------------------------------------------------------------------------

alter table public.class_assignments
  add column if not exists deadline_date date;

-- "다음 수업 전까지"로 지정한 마감 — 날짜/시간은 다음 수업 시작 시각으로 계산된 값이라,
-- 학생에게 날짜 대신 「다음 수업 전까지」로 보여줄 수 있게 구분해 둔다.
alter table public.class_assignments
  add column if not exists deadline_until_next_lesson boolean not null default false;
