-- ---------------------------------------------------------------------------
-- 오류 신고함.
--
-- 학생 앱에는 오류를 모아 두는 곳이 없어서, 화면이 깨져도 개발자가 알 방법이
-- 없었다. 학생이 말해 주지 않으면 그냥 묻힌다. 오류 화면에서 한 번 누르면
-- 여기로 들어오고, Supabase Table Editor에서 바로 본다.
--
-- 외부 서비스를 붙이지 않은 이유: 이미 쓰는 게 있고, 크래시 리포터 하나 때문에
-- 계정·비용·개인정보 처리 위탁을 늘릴 이유가 없다.
-- ---------------------------------------------------------------------------

create table if not exists public.error_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- 로그인 전에도 신고가 되어야 하므로 null 허용
  student_id uuid references auth.users (id) on delete set null,
  -- 오류 요지 (예: "TypeError: Cannot read properties of undefined")
  message text not null,
  -- 어느 화면에서 났는지 (`/student/home` 등)
  path text,
  stack text,
  component_stack text,
  user_agent text,
  -- 나중에 덧붙일 것들(과제 id, 화면 단계 등)을 스키마 변경 없이 담는 자리
  context jsonb not null default '{}'::jsonb,

  -- 길이를 막아 둔다. 공개 INSERT라 누가 큰 값을 밀어 넣을 수 있다.
  constraint error_reports_message_len check (char_length(message) <= 500),
  constraint error_reports_stack_len check (char_length(coalesce(stack, '')) <= 4000),
  constraint error_reports_cstack_len
    check (char_length(coalesce(component_stack, '')) <= 2000),
  constraint error_reports_path_len check (char_length(coalesce(path, '')) <= 300),
  constraint error_reports_ua_len check (char_length(coalesce(user_agent, '')) <= 400)
);

create index if not exists error_reports_created_at_idx
  on public.error_reports (created_at desc);

alter table public.error_reports enable row level security;

-- ---------------------------------------------------------------------------
-- **넣기만 된다.**
--
-- 로그인이 깨진 상태에서도 신고가 들어와야 해서 익명까지 연다.
-- 대신 읽기 정책은 만들지 않는다 — API로는 아무도 못 읽고, 개발자는 대시보드
-- (service role)로 본다. 남의 신고 내용을 앱에서 긁어 갈 방법이 없다.
-- ---------------------------------------------------------------------------

drop policy if exists error_reports_insert_anyone on public.error_reports;
create policy error_reports_insert_anyone on public.error_reports
  for insert with check (
    -- 남의 이름으로 넣지는 못하게
    student_id is null or student_id = auth.uid()
  );
