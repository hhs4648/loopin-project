"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GuideCoachMark } from "@/components/teacher/GuideCoachMark";
import {
  OPEN_CREATE_CLASS_EVENT,
  START_GUIDE_STEPS,
  patchGuideState,
  readGuideState,
  resolveStartGuideProgress,
  type StartGuideProgress,
  type StartGuideStep,
  type StartGuideStepId,
} from "@/lib/teacher-onboarding";
import { CopyToast, copyToClipboard } from "@/components/teacher/CopyToast";
import { ModalCloseButton } from "@/components/teacher/ModalCloseButton";

/**
 * 처음 들어온 선생님을 위한 **시작 가이드**.
 *
 * - 반이 하나도 없으면 인사 카드를 한 번 띄우고, 「시작하기」가 반 만들기 모달을 연다.
 *   설명만 읽히고 끝내면 어차피 어디를 눌러야 할지 모른 채 닫는다.
 * - 그 뒤로는 우측 아래 체크리스트. **다음에 할 한 단계만 펼친다** — 네 개를 늘어놓으면
 *   읽지 않는다.
 * - 완료 여부는 저장하지 않고 실제 데이터로 판정한다(`teacher-onboarding.ts` 참고).
 */
export function StartGuidePanel() {
  const router = useRouter();
  const [progress, setProgress] = useState<StartGuideProgress | null>(null);
  const [greeted, setGreeted] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [copied, setCopied] = useState(false);
  /** 지금 짚고 있는 단계 — null이면 코치마크를 안 띄운다 */
  const [pointing, setPointing] = useState<StartGuideStepId | null>(null);

  const refresh = useCallback(async () => {
    const next = await resolveStartGuideProgress();
    setProgress(next);
  }, []);

  useEffect(() => {
    const stored = readGuideState();
    setGreeted(Boolean(stored.greeted));
    setCollapsed(Boolean(stored.collapsed));
    setDismissed(Boolean(stored.dismissed));
    void refresh();
  }, [refresh]);

  /*
    반·과제는 다른 화면에서 만들어지므로 이 패널은 그 사실을 모른다.
    이 리포가 이미 쓰는 변경 이벤트에 얹어 다시 계산한다.
  */
  useEffect(() => {
    const onChanged = () => void refresh();
    const events = [
      "haksup-class-assignments-changed",
      "haksup-problem-sets-changed",
      OPEN_CREATE_CLASS_EVENT,
    ];
    for (const e of events) window.addEventListener(e, onChanged);
    window.addEventListener("focus", onChanged);
    return () => {
      for (const e of events) window.removeEventListener(e, onChanged);
      window.removeEventListener("focus", onChanged);
    };
  }, [refresh]);

  if (!progress || dismissed) return null;

  // 네 단계를 다 끝냈으면 한 번 알리고 사라진다
  if (progress.allDone) {
    return (
      <GuideShell>
        <div className="flex items-center gap-3">
          <span className="text-[18px]">🎉</span>
          <p className="flex-1 text-[13px] font-semibold text-[#15171A]">
            준비가 다 끝났어요. 이제 학생들이 과제를 풀 수 있어요.
          </p>
          <button
            type="button"
            className="shrink-0 rounded-[8px] bg-[#1AA7F2] px-3 py-1.5 text-[12px] font-bold text-white"
            onClick={() => {
              patchGuideState({ dismissed: true });
              setDismissed(true);
            }}
          >
            닫기
          </button>
        </div>
      </GuideShell>
    );
  }

  // ── 인사 카드 — 반이 없을 때 한 번만 ──────────────────────────────────────
  if (!greeted && !progress.primaryClass) {
    return (
      <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-black/25">
        <div className="pointer-events-auto relative w-[380px] rounded-[18px] bg-white p-7 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
          <div className="absolute right-4 top-4">
            <ModalCloseButton
              onClick={() => {
                patchGuideState({ greeted: true, collapsed: true });
                setGreeted(true);
                setCollapsed(true);
              }}
            />
          </div>
          <span className="text-[26px]">👋</span>
          <h2 className="mt-3 text-[19px] font-bold leading-snug text-[#15171A]">
            학습 사용 가이드
          </h2>
          <p className="mt-2 text-[14px] font-medium leading-[1.6] text-[#5A6472]">
            반과 수업 일정을 두고, 교과서 단원에서 문제를 골라 내주고,
            학생이 어디까지 풀었는지 봅니다. 수업에 필요한 일을 여기서 합니다.
          </p>
          <p className="mt-3 text-[13px] font-semibold text-[#3D4148]">
            먼저 이 네 가지만 해두면 준비가 끝나요.
          </p>
          <ol className="mt-4 space-y-1.5">
            {START_GUIDE_STEPS.map((step, i) => (
              <li
                key={step.id}
                className="flex items-center gap-2 text-[13px] font-semibold text-[#3D4148]"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#EAF6FE] text-[11px] font-bold text-[#1AA7F2]">
                  {i + 1}
                </span>
                {step.title}
              </li>
            ))}
          </ol>
          <div className="mt-6 flex items-center gap-2">
            <button
              type="button"
              className="flex-1 rounded-[12px] bg-[#1AA7F2] py-3 text-[14px] font-bold text-white hover:bg-[#1596DB]"
              onClick={() => {
                /*
                  대신 반을 만들어 주지 않는다. **「새 반 추가」 버튼을 짚어 주고
                  직접 누르게 한다** — 대신 눌러 주면 다음에 혼자 할 때 못 찾는다.
                */
                patchGuideState({ greeted: true });
                setGreeted(true);
                setPointing("create-class");
              }}
            >
              시작하기
            </button>
            <button
              type="button"
              className="rounded-[12px] px-4 py-3 text-[14px] font-semibold text-[#9CA3AF] hover:text-[#3D4148]"
              onClick={() => {
                patchGuideState({ greeted: true, collapsed: true });
                setGreeted(true);
                setCollapsed(true);
              }}
            >
              나중에
            </button>
          </div>
          {/* 안내가 필요 없는 분을 붙잡아 두지 않는다 */}
          <div className="mt-2 text-center">
            <button
              type="button"
              className="text-[12px] font-semibold text-[#9CA3AF] underline underline-offset-2 hover:text-[#EF4444]"
              onClick={() => {
                patchGuideState({ greeted: true, dismissed: true });
                setGreeted(true);
                setDismissed(true);
              }}
            >
              가이드 건너뛰기
            </button>
          </div>
        </div>
      </div>
    );
  }

  const total = START_GUIDE_STEPS.length;

  // ── 접힌 상태 — 배지만 ────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <button
        type="button"
        className="fixed bottom-5 right-5 z-[55] flex items-center gap-2 rounded-full border border-[#E1E2E4] bg-white px-4 py-2.5 text-[13px] font-bold text-[#3D4148] shadow-[0_4px_16px_rgba(0,0,0,0.10)] hover:border-[#1AA7F2]"
        onClick={() => {
          patchGuideState({ collapsed: false });
          setCollapsed(false);
        }}
      >
        시작 가이드
        <span className="rounded-full bg-[#EAF6FE] px-2 py-0.5 text-[12px] font-bold text-[#1AA7F2]">
          {progress.doneCount}/{total}
        </span>
      </button>
    );
  }

  const next = progress.next;

  return (
    <>
      {pointing ? (
        <GuideCoachMark
          step={pointing}
          classId={progress.primaryClass?.id ?? ""}
          onClose={() => setPointing(null)}
          onSkipAll={() => {
            patchGuideState({ dismissed: true });
            setDismissed(true);
            setPointing(null);
          }}
          onGo={(href) => router.push(href)}
          onProgressMayChange={() => void refresh()}
        />
      ) : null}
      <GuideShell>
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-[#15171A]">시작 가이드</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#EAF6FE] px-2 py-0.5 text-[12px] font-bold text-[#1AA7F2]">
            {progress.doneCount}/{total}
          </span>
          <button
            type="button"
            className="text-[12px] font-semibold text-[#9CA3AF] hover:text-[#3D4148]"
            onClick={() => {
              patchGuideState({ collapsed: true });
              setCollapsed(true);
            }}
          >
            접기
          </button>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {START_GUIDE_STEPS.map((step) => {
          const done = progress.done[step.id];
          const isNext = next?.id === step.id;
          return (
            <li key={step.id}>
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    done
                      ? "bg-[#A4D24C] text-white"
                      : isNext
                        ? "bg-[#1AA7F2] text-white"
                        : "border border-[#E1E2E4] bg-white text-[#C4C4C4]"
                  }`}
                >
                  {done ? "✓" : ""}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[13px] font-semibold ${
                      done ? "text-[#9CA3AF] line-through" : "text-[#15171A]"
                    }`}
                  >
                    {step.title}
                  </p>

                  {/* 다음 단계만 펼친다 */}
                  {isNext ? (
                    <>
                      <p className="mt-1 text-[12px] font-medium leading-[1.5] text-[#6B7280]">
                        {step.hint}
                      </p>
                      <StepAction
                        step={step}
                        inviteCode={progress.primaryClass?.inviteCode ?? ""}
                        copied={copied}
                        onCopied={() => {
                          setCopied(true);
                          window.setTimeout(() => setCopied(false), 2000);
                        }}
                        onPoint={() => setPointing(step.id)}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </GuideShell>
      <CopyToast visible={copied} />
    </>
  );
}



function GuideShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed bottom-5 right-5 z-[55] w-[300px] rounded-[16px] border border-[#E1E2E4] bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.12)]">
      {children}
    </div>
  );
}

function StepAction({
  step,
  inviteCode,
  copied,
  onCopied,
  onPoint,
}: {
  step: StartGuideStep;
  inviteCode: string;
  copied: boolean;
  onCopied: () => void;
  /** 화면의 실제 버튼을 짚어 준다 — 대신 눌러 주지 않는다 */
  onPoint: () => void;
}) {
  const base =
    "mt-2 rounded-[9px] px-3 py-1.5 text-[12px] font-bold transition-colors";

  if (step.id === "create-class") {
    return (
      <button
        type="button"
        className={`${base} bg-[#1AA7F2] text-white hover:bg-[#1596DB]`}
        onClick={onPoint}
      >
        {step.cta}
      </button>
    );
  }

  /*
    초대 코드는 **가이드 안에서 바로 복사**한다. 반 홈까지 찾아가게 하면
    「어디 있더라」로 끝난다. 반 홈의 복사 버튼과 같은 동작이다.
  */
  if (step.id === "invite-students") {
    return (
      <div className="mt-2 flex items-center gap-2">
        <span className="rounded-[8px] border border-[#E0E4EA] bg-[#F7FCF2] px-2.5 py-1 text-[13px] font-bold tracking-wide text-[#16150F]">
          {inviteCode || "—"}
        </span>
        <button
          type="button"
          disabled={!inviteCode}
          className={`${base} mt-0 bg-[#1AA7F2] text-white hover:bg-[#1596DB] disabled:bg-[#C4C4C4]`}
          onClick={() => {
            if (!inviteCode) return;
            void copyToClipboard(inviteCode).then((ok) => {
              if (ok) onCopied();
            });
          }}
        >
          {copied ? "복사됨" : "코드 복사"}
        </button>
        <button
          type="button"
          className={`${base} mt-0 border border-[#E1E2E4] bg-white text-[#3D4148] hover:border-[#1AA7F2] hover:text-[#1AA7F2]`}
          onClick={onPoint}
        >
          위치 보기
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${base} bg-[#1AA7F2] text-white hover:bg-[#1596DB]`}
      onClick={onPoint}
    >
      {step.cta}
    </button>
  );
}
