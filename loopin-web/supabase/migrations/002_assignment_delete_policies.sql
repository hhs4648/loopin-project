-- ---------------------------------------------------------------------------
-- attempts / answers 테이블에 DELETE 정책이 없어서, 교사가 과제·문제 세트를
-- 삭제할 때 발생하는 ON DELETE CASCADE가 RLS에 막혀 통째로 실패하던 문제 수정.
-- (교사 앱은 에러를 console.warn만 하고 넘어가서, 로컬에서는 삭제된 것처럼
--  보이지만 실제 Supabase 행은 남아 학생 앱에 계속 노출되고 있었다.)
-- ---------------------------------------------------------------------------

drop policy if exists attempts_delete_teacher on public.attempts;
create policy attempts_delete_teacher on public.attempts
  for delete using (
    exists (
      select 1
      from public.class_assignments a
      where a.id = attempts.assignment_id
        and public.is_teacher_of_class(a.class_id)
    )
  );

drop policy if exists answers_delete_teacher on public.answers;
create policy answers_delete_teacher on public.answers
  for delete using (
    exists (
      select 1
      from public.attempts t
      where t.id = answers.attempt_id
        and exists (
          select 1
          from public.class_assignments a
          where a.id = t.assignment_id
            and public.is_teacher_of_class(a.class_id)
        )
    )
  );
