-- ---------------------------------------------------------------------------
-- 선생님이 반에서 학생을 뺄 수 있게 한다.
--
-- `enrollments`에는 **DELETE 정책이 아예 없었다.** select(본인·담당교사)와
-- insert(본인)만 있어서, 교사가 「학생 삭제」를 눌러도 서버 행은 그대로 남았다.
-- 교사 앱은 로컬 목록에서만 지웠고, 잠시 뒤 `fetchClassEnrollments` →
-- `mergeEnrolledStudents`가 서버 값을 다시 합치면서 **지운 학생이 되살아났다.**
--
-- 학생 본인도 탈퇴(반 나가기)할 수 있어야 하므로 두 경우를 모두 연다.
-- ---------------------------------------------------------------------------

drop policy if exists enrollments_delete_teacher_or_self on public.enrollments;
create policy enrollments_delete_teacher_or_self on public.enrollments
  for delete using (
    student_id = auth.uid()
    or public.is_teacher_of_class(class_id)
  );
