const fs = require("fs");
const s = fs.readFileSync("assets/calendar-home.svg", "utf8");
const rects = [...s.matchAll(/<rect\s[^>]*>/g)].map((m) => m[0]);
const top = rects
  .map((r) => {
    const g = (k) => {
      const m = r.match(new RegExp(k + '="([^"]+)"'));
      return m ? parseFloat(m[1]) : null;
    };
    return {
      x: g("x"),
      y: g("y"),
      w: g("width"),
      h: g("height"),
      rx: g("rx"),
      fill: (r.match(/fill="([^"]+)"/) || [])[1],
      stroke: (r.match(/stroke="([^"]+)"/) || [])[1],
    };
  })
  .filter(
    (p) =>
      p.x != null &&
      p.y != null &&
      p.y >= 35 &&
      p.y <= 100 &&
      p.x >= 800 &&
      p.w != null,
  );
top.sort((a, b) => a.x - b.x);
console.log(JSON.stringify(top, null, 2));
