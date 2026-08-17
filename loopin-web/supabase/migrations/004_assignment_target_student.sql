-- ---------------------------------------------------------------------------
-- 학생별 오답 복습 과제: class_assignments에 대상 학생을 지정할 수 있게 한다.
-- target_student_id 가 null 이면 반 전체, 값이 있으면 해당 학생만 앱에서 본다.
-- ---------------------------------------------------------------------------

alter table public.class_assignments
  add column if not exists target_student_id uuid
    references public.profiles (id) on delete cascade;

create index if not exists class_assignments_target_student_id_idx
  on public.class_assignments (target_student_id);

drop policy if exists class_assignments_select_related on public.class_assignments;
create policy class_assignments_select_related on public.class_assignments
  for select using (
    public.is_teacher_of_class(class_id)
    or (
      public.is_enrolled_in_class(class_id)
      and (
        target_student_id is null
        or target_student_id = auth.uid()
      )
    )
  );
