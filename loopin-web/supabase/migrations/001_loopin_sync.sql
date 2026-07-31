-- Loopin teacher ↔ student sync (Supabase PostgreSQL + Anonymous Auth + Realtime)
-- Apply in Supabase SQL editor or via `supabase db push`.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (auth.users ↔ app role)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('student', 'teacher')),
  display_name text,
  grade text,
  birthdate text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Classes (preserve string ids: class-*)
-- ---------------------------------------------------------------------------
create table if not exists public.classes (
  id text primary key,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  grade text,
  invite_code text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_invite_code_format check (invite_code ~ '^[A-Z0-9]{6}$')
);

create unique index if not exists classes_invite_code_uidx
  on public.classes (invite_code);

create index if not exists classes_teacher_id_idx
  on public.classes (teacher_id);

-- ---------------------------------------------------------------------------
-- Class invites (code history / lookup helper; active code also on classes)
-- ---------------------------------------------------------------------------
create table if not exists public.class_invites (
  id uuid primary key default gen_random_uuid(),
  class_id text not null references public.classes (id) on delete cascade,
  code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint class_invites_code_format check (code ~ '^[A-Z0-9]{6}$')
);

create unique index if not exists class_invites_code_uidx
  on public.class_invites (code);

create index if not exists class_invites_class_id_idx
  on public.class_invites (class_id);

-- ---------------------------------------------------------------------------
-- Enrollments (immediate join on valid invite)
-- ---------------------------------------------------------------------------
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id text not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique (class_id, student_id)
);

create index if not exists enrollments_student_id_idx
  on public.enrollments (student_id);

create index if not exists enrollments_class_id_idx
  on public.enrollments (class_id);

-- ---------------------------------------------------------------------------
-- Problem sets
-- ---------------------------------------------------------------------------
create table if not exists public.problem_sets (
  id text primary key,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  grade text,
  textbook text,
  unit text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists problem_sets_teacher_id_idx
  on public.problem_sets (teacher_id);

-- ---------------------------------------------------------------------------
-- Class assignments (+ immutable content_snapshot)
-- ---------------------------------------------------------------------------
create table if not exists public.class_assignments (
  id text primary key,
  class_id text not null references public.classes (id) on delete cascade,
  problem_set_id text not null references public.problem_sets (id) on delete cascade,
  lesson_date date not null,
  deadline_time text not null,
  content_snapshot jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  assigned_at timestamptz not null default now()
);

create index if not exists class_assignments_class_id_idx
  on public.class_assignments (class_id);

create index if not exists class_assignments_problem_set_id_idx
  on public.class_assignments (problem_set_id);

-- ---------------------------------------------------------------------------
-- Attempts / Answers
-- ---------------------------------------------------------------------------
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id text not null references public.class_assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  answered_count integer not null default 0,
  correct_count integer not null default 0,
  progress_percent integer not null default 0,
  score numeric,
  question_total integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists attempts_assignment_id_idx
  on public.attempts (assignment_id);

create index if not exists attempts_student_id_idx
  on public.attempts (student_id);

create index if not exists attempts_assignment_student_idx
  on public.attempts (assignment_id, student_id, started_at desc);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  question_id text not null,
  client_answer_id text not null,
  payload jsonb not null default '{}'::jsonb,
  is_correct boolean,
  created_at timestamptz not null default now(),
  unique (client_answer_id)
);

create index if not exists answers_attempt_id_idx
  on public.answers (attempt_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists classes_set_updated_at on public.classes;
create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function public.set_updated_at();

drop trigger if exists problem_sets_set_updated_at on public.problem_sets;
create trigger problem_sets_set_updated_at
  before update on public.problem_sets
  for each row execute function public.set_updated_at();

drop trigger if exists attempts_set_updated_at on public.attempts;
create trigger attempts_set_updated_at
  before update on public.attempts
  for each row execute function public.set_updated_at();

create or replace function public.is_teacher_of_class(p_class_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = p_class_id
      and c.teacher_id = auth.uid()
  );
$$;

create or replace function public.is_enrolled_in_class(p_class_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.class_id = p_class_id
      and e.student_id = auth.uid()
  );
$$;

-- Atomic invite validation + immediate enrollment
create or replace function public.enroll_with_invite_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_class public.classes%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', '로그인이 필요해요.');
  end if;

  if length(v_code) <> 6 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CODE', 'message', '초대코드 형식이 올바르지 않아요.');
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_PROFILE', 'message', '학생 프로필이 없어요.');
  end if;
  if v_profile.role <> 'student' then
    return jsonb_build_object('ok', false, 'code', 'NOT_STUDENT', 'message', '학생 계정만 가입할 수 있어요.');
  end if;

  select c.* into v_class
  from public.classes c
  left join public.class_invites i on i.class_id = c.id and i.code = v_code and i.active
  where c.invite_code = v_code or i.code is not null
  limit 1;

  if v_class.id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CODE', 'message', '유효하지 않은 초대코드예요.');
  end if;

  select * into v_enrollment
  from public.enrollments
  where class_id = v_class.id and student_id = v_uid;

  if v_enrollment.id is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'ALREADY_ENROLLED',
      'message', '이미 가입한 반이에요.',
      'enrollment', to_jsonb(v_enrollment),
      'class', jsonb_build_object(
        'id', v_class.id,
        'name', v_class.name,
        'grade', v_class.grade,
        'inviteCode', v_class.invite_code
      )
    );
  end if;

  insert into public.enrollments (class_id, student_id)
  values (v_class.id, v_uid)
  returning * into v_enrollment;

  return jsonb_build_object(
    'ok', true,
    'code', 'ENROLLED',
    'enrollment', to_jsonb(v_enrollment),
    'class', jsonb_build_object(
      'id', v_class.id,
      'name', v_class.name,
      'grade', v_class.grade,
      'inviteCode', v_class.invite_code
    )
  );
end;
$$;

revoke all on function public.enroll_with_invite_code(text) from public;
grant execute on function public.enroll_with_invite_code(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_invites enable row level security;
alter table public.enrollments enable row level security;
alter table public.problem_sets enable row level security;
alter table public.class_assignments enable row level security;
alter table public.attempts enable row level security;
alter table public.answers enable row level security;

-- profiles
drop policy if exists profiles_select_own_or_teacher on public.profiles;
create policy profiles_select_own_or_teacher on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1
      from public.enrollments e
      join public.classes c on c.id = e.class_id
      where e.student_id = profiles.id
        and c.teacher_id = auth.uid()
    )
  );

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- classes
drop policy if exists classes_select_teacher_or_enrolled on public.classes;
create policy classes_select_teacher_or_enrolled on public.classes
  for select using (
    teacher_id = auth.uid()
    or public.is_enrolled_in_class(id)
  );

drop policy if exists classes_insert_teacher on public.classes;
create policy classes_insert_teacher on public.classes
  for insert with check (teacher_id = auth.uid());

drop policy if exists classes_update_teacher on public.classes;
create policy classes_update_teacher on public.classes
  for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists classes_delete_teacher on public.classes;
create policy classes_delete_teacher on public.classes
  for delete using (teacher_id = auth.uid());

-- class_invites
drop policy if exists class_invites_select_teacher on public.class_invites;
create policy class_invites_select_teacher on public.class_invites
  for select using (public.is_teacher_of_class(class_id));

drop policy if exists class_invites_write_teacher on public.class_invites;
create policy class_invites_write_teacher on public.class_invites
  for all using (public.is_teacher_of_class(class_id))
  with check (public.is_teacher_of_class(class_id));

-- enrollments
drop policy if exists enrollments_select_related on public.enrollments;
create policy enrollments_select_related on public.enrollments
  for select using (
    student_id = auth.uid()
    or public.is_teacher_of_class(class_id)
  );

drop policy if exists enrollments_insert_self on public.enrollments;
create policy enrollments_insert_self on public.enrollments
  for insert with check (student_id = auth.uid());

-- problem_sets
drop policy if exists problem_sets_select_teacher_or_enrolled on public.problem_sets;
create policy problem_sets_select_teacher_or_enrolled on public.problem_sets
  for select using (
    teacher_id = auth.uid()
    or exists (
      select 1
      from public.class_assignments a
      where a.problem_set_id = problem_sets.id
        and public.is_enrolled_in_class(a.class_id)
    )
  );

drop policy if exists problem_sets_write_teacher on public.problem_sets;
create policy problem_sets_write_teacher on public.problem_sets
  for all using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- class_assignments
drop policy if exists class_assignments_select_related on public.class_assignments;
create policy class_assignments_select_related on public.class_assignments
  for select using (
    public.is_teacher_of_class(class_id)
    or public.is_enrolled_in_class(class_id)
  );

drop policy if exists class_assignments_write_teacher on public.class_assignments;
create policy class_assignments_write_teacher on public.class_assignments
  for all using (public.is_teacher_of_class(class_id))
  with check (public.is_teacher_of_class(class_id));

-- attempts
drop policy if exists attempts_select_related on public.attempts;
create policy attempts_select_related on public.attempts
  for select using (
    student_id = auth.uid()
    or exists (
      select 1
      from public.class_assignments a
      where a.id = attempts.assignment_id
        and public.is_teacher_of_class(a.class_id)
    )
  );

drop policy if exists attempts_insert_self on public.attempts;
create policy attempts_insert_self on public.attempts
  for insert with check (student_id = auth.uid());

drop policy if exists attempts_update_self on public.attempts;
create policy attempts_update_self on public.attempts
  for update using (student_id = auth.uid()) with check (student_id = auth.uid());

-- answers
drop policy if exists answers_select_related on public.answers;
create policy answers_select_related on public.answers
  for select using (
    exists (
      select 1 from public.attempts t
      where t.id = answers.attempt_id
        and (
          t.student_id = auth.uid()
          or exists (
            select 1 from public.class_assignments a
            where a.id = t.assignment_id
              and public.is_teacher_of_class(a.class_id)
          )
        )
    )
  );

drop policy if exists answers_insert_self on public.answers;
create policy answers_insert_self on public.answers
  for insert with check (
    exists (
      select 1 from public.attempts t
      where t.id = answers.attempt_id
        and t.student_id = auth.uid()
    )
  );

-- Realtime
alter publication supabase_realtime add table public.enrollments;
alter publication supabase_realtime add table public.attempts;
alter publication supabase_realtime add table public.class_assignments;
