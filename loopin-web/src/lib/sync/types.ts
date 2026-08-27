/**
 * Shared teacher ↔ student sync DTOs.
 * Contract source: student-teacher-sync.md + supabase/migrations/001_haksup_sync.sql
 */

export type SyncRole = "student" | "teacher";

export type AttemptStatus = "in_progress" | "completed";

export type CastleStatus = "active" | "in_progress" | "completed";

export type StudentProfile = {
  id: string;
  role: SyncRole;
  displayName: string;
  grade?: string;
  birthdate?: string;
  createdAt: string;
  updatedAt: string;
};

export type Enrollment = {
  id: string;
  classId: string;
  studentId: string;
  enrolledAt: string;
  className?: string;
  classGrade?: string;
  inviteCode?: string;
  studentName?: string;
  studentGrade?: string;
};

export type ProblemWordSnapshot = {
  id: string;
  english: string;
  korean: string;
  exampleEn?: string;
  exampleKo?: string;
};

export type ProblemSentenceSnapshot = {
  id: string;
  english: string;
  korean: string;
  chunksEn?: string;
  chunksKo?: string;
  wrongChunks?: string;
  hint?: string;
};

export type ProblemGrammarSnapshot = {
  id: string;
  english: string;
  korean: string;
  ox?: string;
  wrongPart?: string;
  choices?: string;
  explanation?: string;
  /**
   * 문법 개념 대분류/소분류 (문제은행 `major`/`minor` — 예: `관계대명사` / `관계대명사 what`).
   * 학생앱 복습 탭이 유형별 정답률을 낼 때 쓴다. 이전에 만든 과제 스냅샷에는 없으므로
   * 학생앱은 반드시 없는 경우를 처리해야 한다.
   */
  major?: string;
  minor?: string;
};

export type ContentSnapshot = {
  version: 1;
  title: string;
  grade: string;
  textbook: string;
  unit: string;
  problemTypes: {
    words: string[];
    sentences: string[];
    grammar: string[];
  };
  words: ProblemWordSnapshot[];
  sentences: ProblemSentenceSnapshot[];
  grammar: ProblemGrammarSnapshot[];
};

export type StudentAssignment = {
  assignmentId: string;
  classId: string;
  order: number;
  title: string;
  status: CastleStatus;
  progressPercent: number;
  lessonDate: string;
  deadlineTime: string;
  assignedAt: string;
  questionTotal: number;
  contentSnapshot: ContentSnapshot;
  latestAttemptId?: string;
  latestScore?: number | null;
  firstScore?: number | null;
  completedAt?: string | null;
};

export type AttemptProgress = {
  id: string;
  assignmentId: string;
  studentId: string;
  status: AttemptStatus;
  answeredCount: number;
  correctCount: number;
  progressPercent: number;
  score: number | null;
  questionTotal: number;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
};

export type AnswerEvent = {
  id?: string;
  attemptId: string;
  questionId: string;
  clientAnswerId: string;
  payload: Record<string, unknown>;
  isCorrect: boolean | null;
  createdAt?: string;
};

export type EnrollResult =
  | {
      ok: true;
      code: "ENROLLED";
      enrollment: Enrollment;
      class: { id: string; name: string; grade?: string; inviteCode: string };
    }
  | {
      ok: false;
      code:
        | "UNAUTHENTICATED"
        | "INVALID_CODE"
        | "NO_PROFILE"
        | "NOT_STUDENT"
        | "ALREADY_ENROLLED"
        | "SYNC_DISABLED"
        | "UNKNOWN";
      message: string;
      enrollment?: Enrollment;
      class?: { id: string; name: string; grade?: string; inviteCode: string };
    };

export type StudentProgressRow = {
  studentId: string;
  studentName: string;
  status: "idle" | "in_progress" | "completed";
  progressPercent: number;
  latestAccuracy: number | null;
  /**
   * 과제마다 **마지막 시도** 점수만 모아 산술평균 (중간 재도전은 제외).
   * 점수가 있는 과제가 없으면 null.
   */
  averageAccuracy: number | null;
  firstScore: number | null;
  latestScore: number | null;
  /**
   * 마지막 **완료** 시도의 실제 맞은/푼 문항 수.
   *
   * 점수(%)에서 개수를 역산하면 안 된다 — 반올림 때문에 96%가 `7/7`로 보이는 일이 생긴다.
   * 「다 고쳤나」 판정도 이 두 값으로 해야 표시와 배지가 어긋나지 않는다.
   */
  latestCorrectCount: number | null;
  latestAnsweredCount: number | null;
  submittedAt: string | null;
  lastLearnedAt: string | null;
  /** 오늘(또는 어제)까지 이어진 학습 활동 연속 일수. 끊기면 0. */
  studyStreakDays: number;
};

export type QuestionStat = {
  questionId: string;
  category: "단어" | "문장" | "문법";
  text: string;
  /** 학생마다 과제 마지막 시도의 answers만으로 집계한 정답률. 없으면 null. */
  correctRate: number | null;
  answeredCount: number;
};

export type QuestionTypeStudentResult = {
  studentId: string;
  studentName: string;
  isCorrect: boolean;
};

export type QuestionTypeBreakdown = {
  typeKey: string;
  typeLabel: string;
  correctRate: number | null;
  answeredCount: number;
  correctStudents: QuestionTypeStudentResult[];
  wrongStudents: QuestionTypeStudentResult[];
};

export type QuestionDetailStats = {
  questionId: string;
  types: QuestionTypeBreakdown[];
};
