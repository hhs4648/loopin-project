-- 교사 계정 설정(학교 브랜드·학사일정·추가 수업·학생 메모)을 기기 간에 옮긴다.
-- 코드는 이 컬럼이 없으면 problem_sets 예약 행(haksup-workspace:{uid})으로 대체한다.

alter table public.profiles
  add column if not exists workspace jsonb;
