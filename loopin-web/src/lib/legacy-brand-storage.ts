/**
 * 브랜드 이름이 바뀌기 전(구 `loopin*`) 저장소 키를 새 키(`haksup*`)로 **한 번 옮긴다.**
 *
 * 교사 웹은 반·학생·문제집·과제 부여·캘린더를 브라우저 localStorage에 들고 있다.
 * 키 이름만 바꾸고 옮기지 않으면 **선생님이 만들어 둔 것이 전부 사라진 것처럼 보인다.**
 * 그래서 이름을 바꾸는 대신 값을 그대로 넘긴다.
 *
 * 여기 남아 있는 `loopin` 문자열은 브랜드 흔적이 아니라 **옛 키를 찾기 위한 열쇠**다.
 * 선생님들 기기에서 구 키가 다 사라졌다고 판단되면 이 파일과 `layout.tsx`의 주입 한
 * 줄을 지우면 된다.
 *
 * 앱 코드가 아니라 **인라인 `<script>`로 나간다.** 리액트 effect는 자식이 먼저 도는
 * 데다, 저장소를 읽는 모듈이 그보다 먼저 평가될 수 있어서 늦는다. HTML에 박아 두면
 * Next의 번들(defer)보다 확실히 먼저 실행된다.
 */
export const LEGACY_BRAND_STORAGE_SCRIPT = `(function(){
  try {
    var move = function (store) {
      var keys = [];
      for (var i = 0; i < store.length; i += 1) {
        var k = store.key(i);
        if (k && k.indexOf('loopin') === 0) keys.push(k);
      }
      for (var j = 0; j < keys.length; j += 1) {
        var legacy = keys[j];
        var next = 'haksup' + legacy.slice('loopin'.length);
        var value = store.getItem(legacy);
        if (value === null) continue;
        if (store.getItem(next) === null) store.setItem(next, value);
        store.removeItem(legacy);
      }
    };
    move(window.localStorage);
    move(window.sessionStorage);
  } catch (e) {
    /* 저장소를 못 쓰는 환경 — 조용히 넘어간다 */
  }
})();`;
