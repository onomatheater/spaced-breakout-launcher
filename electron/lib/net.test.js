// Headless test for electron/lib/net.js — no electron needed.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { downloadFile, fetchJson, headInfo } = require("./net");

const DATA = crypto.randomBytes(8 * 1024 * 1024);
const HASH = crypto.createHash("sha1").update(DATA).digest("hex");
let killOnce = true;

const server = http.createServer((req, res) => {
  if (req.url === "/json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }
  const total = DATA.length;
  res.setHeader("Accept-Ranges", "bytes");
  const m = /^bytes=(\d+)-$/.exec(req.headers.range || "");
  const start = m ? Math.min(Number(m[1]), total) : 0;
  if (req.method === "HEAD") {
    res.writeHead(200, { "Content-Length": total });
    return res.end();
  }
  if (start > 0) res.writeHead(206, { "Content-Length": total - start, "Content-Range": `bytes ${start}-${total - 1}/${total}` });
  else res.writeHead(200, { "Content-Length": total });
  const CH = 256 * 1024;
  let off = start;
  (function push() {
    if (killOnce && off - start > 1024 * 1024) {
      killOnce = false;
      return res.destroy();
    }
    if (off >= total) return res.end();
    const end = Math.min(off + CH, total);
    const chunk = DATA.subarray(off, end);
    off = end;
    if (!res.write(chunk)) return res.once("drain", push);
    setImmediate(push);
  })();
});

let pass = 0;
async function t(name, fn) {
  try {
    await fn();
    pass++;
    console.log("PASS", name);
  } catch (e) {
    console.log("FAIL", name, "-", e.message);
    process.exitCode = 1;
  }
}
const sha = (p) => crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
const tmp = (n) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "net-")), n);

server.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  await t("fetchJson", async () => {
    const j = await fetchJson(base + "/json");
    if (!j.ok) throw new Error("bad json");
  });
  await t("headInfo", async () => {
    const i = await headInfo(base + "/file");
    if (i.total !== DATA.length || !i.acceptRanges) throw new Error(JSON.stringify(i));
  });
  await t("full download", async () => {
    const d = tmp("a.zip");
    await downloadFile(base + "/file", d, () => {});
    if (sha(d) !== HASH) throw new Error("content mismatch");
  });
  await t("resume from .part", async () => {
    const d = tmp("b.zip");
    fs.writeFileSync(d + ".part", DATA.subarray(0, DATA.length / 2));
    const r = await downloadFile(base + "/file", d, () => {});
    if (!r.resumed) throw new Error("not resumed");
    if (sha(d) !== HASH) throw new Error("content mismatch");
  });
  await t("retry after broken connection", async () => {
    killOnce = true;
    const d = tmp("c.zip");
    await downloadFile(base + "/file", d, () => {});
    if (sha(d) !== HASH) throw new Error("content mismatch");
  });
  await t("cancel", async () => {
    const d = tmp("d.zip");
    let n = 0;
    try {
      await downloadFile(base + "/file", d, () => {}, () => ++n > 3);
      throw new Error("should have cancelled");
    } catch (e) {
      if (!String(e.message).includes("cancelled")) throw e;
    }
  });
  console.log(pass === 6 ? "ALL 6 PASS" : "FAILURES PRESENT");
  server.close();
});
