const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const target = process.argv.includes("--admin") ? "admin.html" : "index.html";
function ready() {
  return new Promise((resolve) => {
    const request = http.get("http://127.0.0.1:4173/api/state", (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => { try { const state = JSON.parse(body); resolve(Array.isArray(state.items) && typeof state.revision === "string"); } catch (error) { resolve(false); } });
    });
    request.setTimeout(1000, () => request.destroy());
    request.on("error", () => resolve(false));
  });
}
(async () => {
  if (!await ready()) {
    fs.mkdirSync(path.join(root, "output"), { recursive: true });
    const log = fs.openSync(path.join(root, "output", "server.log"), "a");
    const child = spawn(process.execPath, [path.join(__dirname, "start-server.cjs")], { cwd: root, windowsHide: true, detached: true, stdio: ["ignore", log, log] });
    child.unref(); fs.closeSync(log);
  }
  for (let i = 0; i < 15; i++) {
    if (await ready()) {
      const url = `http://127.0.0.1:4173/${target}`;
      const browser = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/c", "start", "", url], { windowsHide: true, stdio: "ignore" });
      browser.unref(); return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.error("De lokale server kon niet starten. Zie output/server.log. Controleer of Python 3 en Node.js beschikbaar zijn.");
  process.exitCode = 1;
})();
