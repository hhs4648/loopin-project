/** 문장 기반 자동 문제 생성 — AI 입출력 타입 (실 API 교체 시에도 유지) */

export type PartOfSpeech =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "preposition"
  | "conjunction"
  | "pronoun"
  | "determiner"
  | "other";

export const PART_OF_SPEECH_LABELS: Record<PartOfSpeech, string> = {
  noun: "명사",
  verb: "동사",
  adjective: "형용사",
  adverb: "부사",
  preposition: "전치사",
  conjunction: "접속사",
  pronoun: "대명사",
  determiner: "한정사",
  other: "기타",
};

export type WordAnalysis = {
  /** `${sentenceIndex}:${wordIndex}` */
  id: string;
  sentenceIndex: number;
  wordIndex: number;
  /** 문장에 실제로 표시된 형태 */
  surface: string;
  /** 기본형 */
  lemma: string;
  /** 문맥에 맞는 한국어 뜻 */
  meaningKo: string;
  pos: PartOfSpeech;
  sourceSentence: string;
  translationKo: string;
};

/** 문장유형 자동생성 행 */
export type SentenceAnalysis = {
  sentenceIndex: number;
  english: string;
  translationKo: string;
  /** `/` 구분 영어 청크 */
  chunksEn: string;
  /** `/` 구분 한글 뜻 청크 */
  chunksKo: string;
};

/**
 * 문제 제출 화면과 동일한 유형 키
 * 단어: 짝맞추기 / 음성 짝맞추기 / 3지선다 / 예문 빈칸
 * 문장: 청크배열 / 번역 배열 / 영작
 */
export type CustomProblemTypeId =
  | "match"
  | "listen"
  | "choice"
  | "spell"
  | "chunk"
  | "translate"
  | "write";

export type CustomProblemCategory = "word" | "sentence";

export const CUSTOM_PROBLEM_TYPE_OPTIONS: {
  id: CustomProblemTypeId;
  category: CustomProblemCategory;
  label: string;
  description: string;
}[] = [
  {
    id: "match",
    category: "word",
    label: "짝맞추기",
    description: "영어 단어와 한글 뜻을 짝 맞추기",
  },
  {
    id: "listen",
    category: "word",
    label: "음성 짝맞추기",
    description: "발음을 듣고 알맞은 뜻과 짝 맞추기",
  },
  {
    id: "choice",
    category: "word",
    label: "3지선다",
    description: "단어의 뜻을 보기에서 고르기",
  },
  {
    id: "spell",
    category: "word",
    label: "예문 빈칸",
    description: "예문에서 해당 단어를 빈칸으로 비우기",
  },
  {
    id: "chunk",
    category: "sentence",
    label: "청크배열",
    description: "영어 청크를 알맞은 순서로 배열하기",
  },
  {
    id: "translate",
    category: "sentence",
    label: "번역 배열",
    description: "한글 뜻 청크를 알맞은 순서로 배열하기",
  },
  {
    id: "write",
    category: "sentence",
    label: "영작",
    description: "한글 뜻을 보고 영어 문장 쓰기",
  },
];

export type GeneratedCustomProblem = {
  id: string;
  type: CustomProblemTypeId;
  typeLabel: string;
  category: CustomProblemCategory;
  prompt: string;
  options?: string[];
  answer: string;
  relatedWordId?: string;
  relatedSentenceIndex?: number;
};

export type AnalyzeWordRequest = {
  sentence: string;
  surface: string;
  sentenceIndex: number;
  wordIndex: number;
  /** 사용자가 입력한 문장 뜻 (AI 미사용) */
  translationKo?: string;
};

export type AnalyzeWordResult =
  | { ok: true; data: WordAnalysis }
  | { ok: false; message: string };
