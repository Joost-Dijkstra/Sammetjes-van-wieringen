const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");
const bundled = path.join(require("node:os").homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");
const candidates = process.env.SAMMELTJES_PYTHON ? [[process.env.SAMMELTJES_PYTHON, []]]
  : process.platform === "win32" ? [["py", ["-3"]], ["python", []], [bundled, []]] : [["python3", []], ["python", []]];
const interpreter = candidates.find(([cmd, args]) => spawnSync(cmd, [...args, "--version"], { windowsHide: true }).status === 0);
if (!interpreter) {
  console.error("Python 3 ontbreekt. Installeer Python 3 en open de werkplaats opnieuw.");
  process.exit(1);
}
const [cmd, args] = interpreter;
const runArguments = process.argv[2] === "--python" ? process.argv.slice(3) : [path.resolve(__dirname, "../dev-server.py"), ...process.argv.slice(2)];
const child = spawn(cmd, [...args, ...runArguments], { stdio: "inherit", windowsHide: true });
child.on("exit", (code) => process.exit(code || 0));
process.on("SIGINT", () => child.kill());
process.on("SIGTERM", () => child.kill());
