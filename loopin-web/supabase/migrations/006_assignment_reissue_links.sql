-- ---------------------------------------------------------------------------
-- 오답 재출제 과제의 연결 정보를 서버에 남긴다.
--
-- 지금까지 재출제 과제는 「누구 것인지」(target_student_id, 004)만 알고
-- **「어느 과제의 오답인지」와 「어느 묶음으로 나갔는지」는 제목 문자열에만** 있었다.
-- 그래서 교사 화면이 못 하던 것:
--   - 원본 과제로 건너뛰기 / 원본 점수 대비 얼마나 올랐는지 비교
--   - 같은 과제로 이미 재출제했는지 검사 (만들기를 두 번 누르면 같은 과제가 두 개 생겼다)
--   - 20명에게 한 번에 낸 것을 **한 줄로 묶어** 보고, 한 번에 취소하기
--
-- 로컬(localStorage)에만 둘 수도 있었지만, 그러면 선생님이 다른 기기에서 열었을 때
-- 묶임이 풀려 과제가 학생 수만큼 흩어진다. 그래서 서버 컬럼으로 올린다.
-- ---------------------------------------------------------------------------

-- 오답의 출처가 된 과제. 원본을 지워도 재출제는 남기고 연결만 끊는다
-- (cascade로 지우면 학생이 이미 푼 재출제 기록까지 사라진다).
alter table public.class_assignments
  add column if not exists source_assignment_id text
    references public.class_assignments (id) on delete set null;

-- 한 번의 「앱에 내기」로 만들어진 과제들이 공유하는 묶음 id.
-- 학생 수만큼 행이 생기므로, 교사 화면은 이 값으로 접어서 한 줄로 보여준다.
alter table public.class_assignments
  add column if not exists reissue_batch_id text;

create index if not exists class_assignments_source_assignment_id_idx
  on public.class_assignments (source_assignment_id);

create index if not exists class_assignments_reissue_batch_id_idx
  on public.class_assignments (reissue_batch_id);
