const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { APP_VERSION, WEB_VERSION } = require("./desktop/version.cjs");
const workspaceId = require("node:crypto")
  .createHash("sha256")
  .update(path.resolve(__dirname).toLowerCase())
  .digest("hex");
const publicFiles = new Set(["Equilibrio.ico","entry-tips-ui.js","dossiers-model.js","dossiers-ui.js","mobile-connection-ui.js","mobile-connection.css","receipt-image.js","casa-finance-pilot-model.js","casa-finance-pilot-ui.js","gifts-model.js","gifts-ui.js","assets/fonts/dm-sans.ttf","assets/fonts/OFL-DM-Sans.txt","workbench-ui.js","provider-icons.js","provider-icons-ui.js","approved-visual-ui.js","experience-model.js","experience-ui.js","practical-model.js","practical-ui.js","captura.html",
 "interface-ui.js",
 "productivity-model.js",
 "productivity-ui.js", "reports-model.js", "reports-ui.js", "backup-info.js", "space-transfer-model.js", "space-transfer-ui.js",
 "draft-ui.js",
 "unified-workspace-ui.js",
      "ui-lifecycle.js",
      "receipt-assistance-ui.js",
 "reconciliation-model.js",
 "reconciliation-ui.js",
  "ui.css",
  "casa-render-ui.js",
  "casa-shopping-ui.js",
  "casa-complete-model.js",
  "casa-complete-ui.js",
  "casa-daily-model.js",
  "casa-daily-ui.js",
  "index.html",
  "Equilibrio.png",
  "finance.js",
  "workspace.js",
  "features-model.js",
  "features-ui.js",
  "complete-model.js",
  "complete-ui.js",
  "life-model.js",
  "life-ui.js",
  "planning-model.js",
  "planning-ui.js",
  "daily-ui.js",
  "receipt-model.js",
  "receipt-reader.js",
  "receipt-ui.js",



  "desktop-bridge.js",
  "casa-model.js",
  "casa-life-model.js",
  "casa-life-ui.js",
  "casa-ui.js",
  "casa-home-ui.js",
  "casa-catalog-ui.js",









  "analysis-page-ui.js",



  "wealth-analysis-v3.js",
  "welcome-ui.js",
]);
for (const name of ["tesseract.min.js", "worker.min.js"])
  publicFiles.add("vendor-receipts/tesseract.js/dist/" + name);
for (const base of [
  "tesseract-core",
  "tesseract-core-simd",
  "tesseract-core-lstm",
  "tesseract-core-simd-lstm",
])
  for (const ext of [".wasm", ".wasm.js"])
    publicFiles.add("vendor-receipts/tesseract.js-core/" + base + ext);
for (const name of ["pdf.mjs", "pdf.worker.mjs"])
  publicFiles.add("vendor-receipts/pdfjs-dist/build/" + name);
publicFiles.add("vendor-receipts/por.traineddata.gz");
publicFiles.add("vendor-receipts/por.traineddata");
const types = {".ttf":"font/ttf",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".gz": "application/gzip",
  ".traineddata": "application/octet-stream",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
function createServer() {
  return http.createServer((req, res) => {
    let name;
    try { name = new URL(req.url, "http://localhost").pathname.slice(1) || "index.html"; }
    catch { res.writeHead(400); return res.end("Bad request"); }
    if (name === "__equilibrio_health") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      return res.end(JSON.stringify({ app: "equilibrio", version: APP_VERSION, webVersion: WEB_VERSION, workspaceId }));
    }
    if (!publicFiles.has(name)) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const stream = fs.createReadStream(path.join(__dirname, name));
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(404);
      res.end("Not found");
    });
    stream.once('open', () => {
    res.writeHead(200, {
      "Content-Type": types[path.extname(name)],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    stream.pipe(res);
    });
  });
}
module.exports = { createServer, workspaceId };
if (require.main === module)
  createServer().listen(4173, "127.0.0.1", () =>
    console.log("Equilibrio: http://127.0.0.1:4173"),
  );
