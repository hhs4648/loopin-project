export type ClassStudent = {
  id: string;
  name: string;
  createdAt: string;
  memo?: string;
  /** enrolled = 초대코드 가입, manual = 교사가 직접 추가 */
  source?: "enrolled" | "manual";
};

const STORAGE_KEY = "haksup-class-students";

function storageKey(classId: string): string {
  return `${STORAGE_KEY}:${classId}`;
}

export function loadClassStudents(classId: string): ClassStudent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(classId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ClassStudent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveClassStudents(
  classId: string,
  students: ClassStudent[],
): void {
  window.localStorage.setItem(storageKey(classId), JSON.stringify(students));
}

export function clearClassStudents(classId: string): void {
  window.localStorage.removeItem(storageKey(classId));
}

export function createStudentId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9가-힣-]/gi, "")
    .slice(0, 16);
  return `${slug || "student"}-${Date.now().toString(36)}`;
}
