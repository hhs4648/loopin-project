---
name: run-loopin-web
description: 학습 교사 웹(loopin-web)을 실제로 띄우고 브라우저로 조작해 화면을 확인한다. 문제은행·청크·학생 미리보기 등 변경이 실제 앱에 반영됐는지 눈으로 검증할 때 사용.
---

# 학습 교사 웹 실행 & 화면 검증

Next.js 16(webpack) 앱. **검증은 반드시 실제 화면까지** 가야 한다 — 빌드 통과만으로는
청크·미리보기가 제대로 나오는지 알 수 없다.

## 1. dev 서버

**먼저 이미 떠 있는지 확인한다.** 이 프로젝트는 서버가 상주해 있는 경우가 많고,
중복 실행하면 새 프로세스가 `Another next dev server is already running`으로 스스로 죽는다.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/teacher --max-time 10
```

- `200` → 그대로 쓴다. **남의 서버를 죽이지 말 것.**
- 응답 없음 → 아래로 띄운다 (`loopin-web/`에서 실행, git 루트는 한 단계 위인 `loopin-project/`).

```bash
cd loopin-web && npm run dev        # 포트 3000
```

데이터 파일(`src/data/problem-bank.json`)을 바꿨다면 dev 서버가 알아서 리컴파일한다.
재시작 불필요.

## 2. 브라우저 드라이버

**Claude in Chrome 확장은 이 환경에서 연결이 안 될 때가 많다.** 먼저
`tabs_context_mcp`를 시도하고, `Browser extension is not connected`가 나오면 아래로 간다.

`node_modules/.bin/playwright-core`가 **있지만 패키지 본체는 없다**(고아 bin 링크).
프로젝트 `package.json`을 오염시키지 말고 임시 디렉터리에 따로 설치한다.

```bash
npm install playwright-core --prefix "$SCRATCH" --no-audit --no-fund
```

설치된 Chrome을 직접 지정한다 (playwright 브라우저 다운로드 불필요):

```js
import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
page.on("pageerror", (e) => console.log("PAGEERR:", String(e).slice(0, 300)));
```

> 스크립트는 `$SCRATCH` 안에 두어야 `playwright-core`가 resolve된다.
> 경로 문자열은 **역슬래시 금지** — heredoc에서 먹힌다. 슬래시로 쓸 것.

## 3. 화면 조작 — 셀렉터

**네이티브 `<select>`가 하나도 없다.** 전부 커스텀 드롭다운(`<button>`)이라
`selectOption()`은 못 쓴다. `aria-label`로 잡는 게 유일하게 안정적이다.

| 대상 | 셀렉터 |
|---|---|
| 학년 드롭다운 | `[aria-label="학년 선택"]` |
| 교과서 드롭다운 | `[aria-label="교과서 선택"]` |
| 단원 드롭다운 | `[aria-label="단원 선택"]` |
| 문장 유형 체크박스 | `[aria-label="청크배열"]`, `[aria-label="번역 배열"]`, `[aria-label="영작"]` |
| 단어 유형 체크박스 | `[aria-label="짝맞추기"]`, `[aria-label="3지선다"]`, `[aria-label="예문 빈칸"]` |
| 미리보기 버튼 | `[aria-label="문장 미리보기"]`, `[aria-label="<단어> 미리보기"]` |
| 미리보기 모달 | `[role="dialog"]` |

드롭다운을 연 뒤 항목은 텍스트 완전일치로 고르고 `.last()`를 쓴다 — 트리거 버튼 자신이
같은 텍스트로 먼저 잡히기 때문.

```js
async function openAndPick(ariaLabel, wanted) {
  await page.click(`[aria-label="${ariaLabel}"]`);
  await page.waitForTimeout(500);
  await page.locator('button, [role="option"], li')
    .filter({ hasText: new RegExp(`^${wanted.replace(/[()]/g, "\\$&")}$`) })
    .last().click();
  await page.waitForTimeout(900);
}
```

## 4. 학생 미리보기까지 가는 순서

빠뜨리기 쉬운 함정이 둘 있다.

1. **학년을 바꾸면 교과서 목록이 갈아끼워진다.** 중3은 `YBM(송)` 하나뿐이라,
   중1 기준으로 잡아둔 `NE능률(김)` 셀렉터는 그 순간 사라진다. 반드시 순서대로.
2. **문제 유형을 하나 이상 체크하지 않으면** 미리보기 모달이
   *"선택된 유형이 없어요"* 만 띄운다.

```js
await page.goto("http://localhost:3000/teacher/problems", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

await openAndPick("학년 선택", "중3");
await openAndPick("교과서 선택", "YBM(송)");
await openAndPick("단원 선택", "5단원");

await page.click('[aria-label="청크배열"]');     // ← 이걸 빼면 모달이 빈다
await page.click('[aria-label="번역 배열"]');

await page.locator('[aria-label="문장 미리보기"]').first().click();
const dlg = page.locator('[role="dialog"]').first();
await dlg.screenshot({ path: "preview.png" });
console.log(await dlg.innerText());
```

## 5. 청크를 한 번에 다 확인하는 법

모달을 16번 열 필요 없다. 문장 목록 카드에 청크가 그대로 찍혀 있다.
먼저 「펼치기 (N문장 더)」를 눌러 전부 표시한 뒤 긁는다.

```js
await page.locator("button").filter({ hasText: /펼치기 \(\d+문장 더\)/ }).first().click();
const rows = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    if (el.children.length === 0 && (el.textContent || "").trim().startsWith("청크:")) {
      const card = el.closest("li") || el.parentElement?.parentElement;
      out.push((card?.innerText || "").split("\n").map(s => s.trim()).filter(Boolean));
    }
  }
  return out;
});
```

카드 한 장 = `영어 문장` / `한글 청크(/ 구분)` / `청크: 영어 청크`.

## 6. 읽을 때 오해하기 쉬운 것

- **청크배열 문제의 영어 조각은 소문자로 나온다.** 버그가 아니다 —
  `BodyTextBPreview.normalizeBodyTextBChunk()`가 대문자·마침표를 일부러 지운다
  (첫 조각·끝 조각이 드러나는 걸 막으려고).
- **조각 순서가 뒤섞여 보이는 것도 정상.** 순서 맞추기 문제라 셔플된다.
- 영어 청크 수와 한글 청크 수는 **일치할 필요가 없다.** 본문A는 한글만,
  본문B는 영어만 각각 독립으로 배열시킨다.

## 7. 청크 로직만 빠르게 보고 싶을 때

앱을 안 띄우고도 된다. `src/lib/ai/phrase-chunks.ts`는 **의존성이 0**이라
Node 타입 스트리핑으로 바로 import된다.

```js
import { splitKoreanChunksPhrase, splitEnglishChunksPhrase, formatChunkLine }
  from "./phrase-chunks.ts";   // 파일을 복사해 두고 실행
```

단 최종 확인은 반드시 실제 화면으로 한다 — 데이터가 재생성됐는지,
미리보기가 그 데이터를 읽는지는 오프라인 테스트로 알 수 없다.
