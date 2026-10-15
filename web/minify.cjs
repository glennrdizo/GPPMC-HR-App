// Minifies the inline scripts of the built pages in ../public (called by build.py).
// It makes the published code much harder to read and reuse; it can't make browser code secret.
const fs = require("fs"); const path = require("path"); const { minify } = require("terser");
const OUT = path.join(__dirname, "..", "public");
const OPTS = { ecma: 2022, compress: { passes: 1 }, mangle: true, format: { comments: /Copyright|@license/ } };
(async () => {
  for (const f of ["index.html", "careers.html"]) {
    const p = path.join(OUT, f); const html = fs.readFileSync(p, "utf8"); const parts = []; let last = 0;
    const re = /<script>([\s\S]*?)<\/script>/g; let m;
    while ((m = re.exec(html))) { const r = await minify(m[1], OPTS); parts.push(html.slice(last, m.index), "<script>", r.code.replace(/<\/script/gi, "<\\/script"), "</script>"); last = m.index + m[0].length; }
    parts.push(html.slice(last)); const out = parts.join(""); fs.writeFileSync(p, out);
    console.log("minified", f, html.length, "->", out.length);
  }
  const sw = path.join(OUT, "sw.js"); const r = await minify(fs.readFileSync(sw, "utf8"), OPTS); fs.writeFileSync(sw, r.code);
})().catch((e) => { console.error(e); process.exit(1); });
