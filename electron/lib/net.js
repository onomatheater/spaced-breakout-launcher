// Pure-node network helpers (no electron dependency).
// Testable headless: node lib/net.test.js
const fs = require("fs");
const crypto = require("crypto");
const https = require("https");
const http = require("http");

const libFor = (url) => (url.startsWith("https") ? https : http);

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    libFor(url)
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error("HTTP " + res.statusCode));
        }
        let s = "";
        res.on("data", (c) => (s += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(s));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

// HEAD probe: total size + resume support. Never throws — unknown means zeros.
function headInfo(url) {
  return new Promise((resolve) => {
    const req = libFor(url).request(url, { method: "HEAD" }, (res) => {
      res.resume();
      resolve({
        total: Number(res.headers["content-length"] || 0),
        acceptRanges: String(res.headers["accept-ranges"] || "").toLowerCase() === "bytes",
      });
    });
    req.on("error", () => resolve({ total: 0, acceptRanges: false }));
    req.setTimeout(15000, () => req.destroy());
    req.end();
  });
}

function partSize(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

// Download with resume (.part file) + retries. isCancelled() is polled per chunk.
function downloadFile(url, dest, onProg, isCancelled = () => false, retries = 3) {
  const part = dest + ".part";
  return (async () => {
    let lastErr = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await attemptOnce(url, part, onProg, isCancelled);
      } catch (e) {
        lastErr = e;
        if (String(e && e.message).includes("cancelled")) throw e;
        if (attempt === retries) throw e;
      }
    }
    throw lastErr;
  })().then((r) => {
    fs.renameSync(part, dest);
    return r;
  });
}

function attemptOnce(url, part, onProg, isCancelled) {
  return headInfo(url).then(({ total, acceptRanges }) => {
    let start = 0;
    if (acceptRanges) start = partSize(part);
    else if (partSize(part) > 0) fs.unlinkSync(part);
    if (total && start >= total && start > 0) return { got: start, total, resumed: true, skipped: true };
    return new Promise((resolve, reject) => {
      const headers = start > 0 ? { Range: `bytes=${start}-` } : {};
      libFor(url)
        .get(url, { headers }, (res) => {
          if (res.statusCode === 416) return resolve({ got: start, total, resumed: true });
          if (res.statusCode !== 200 && res.statusCode !== 206) {
            res.resume();
            return reject(new Error("HTTP " + res.statusCode));
          }
          const len = Number(res.headers["content-length"] || 0);
          const full = total || (res.statusCode === 206 ? start + len : len);
          const flags = res.statusCode === 206 ? "a" : "w";
          const file = fs.createWriteStream(part, { flags });
          let got = start;
          const t0 = Date.now();
          const tick = (n) => {
            const dt = Math.max(1, Date.now() - t0);
            onProg({ phase: "download", ratio: full ? got / full : 0, got, total: full, bps: ((got - start) / dt) * 1000 });
          };
          res.on("data", (c) => {
            if (isCancelled()) {
              res.destroy();
              file.close();
              return reject(new Error("cancelled"));
            }
            got += c.length;
            tick();
          });
          res.on("error", (e) => {
            file.close();
            reject(e);
          });
          file.on("error", reject);
          res.pipe(file);
          file.on("finish", () => resolve({ got, total: full, resumed: start > 0 }));
        })
        .on("error", reject);
    });
  });
}

function sha1File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha1");
    fs.createReadStream(p)
      .on("data", (c) => h.update(c))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", reject);
  });
}

module.exports = { fetchJson, headInfo, downloadFile, sha1File };
