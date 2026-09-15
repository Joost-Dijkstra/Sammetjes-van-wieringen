const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const rules = require("../game-rules.js");
const root = path.resolve(__dirname, "..");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "shared-config.js"), "utf8"), sandbox);
let source = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { source += chunk; });
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(source);
    const errors = rules.validate(data, sandbox.window.SAMMELTJES_SHARED_CONFIG.WIERINGEN_POLYGON);
    if (!errors.length) {
      for (const item of data) for (const key of ["image", "thumbnail"]) {
        const target = path.resolve(root, item[key]);
        if (!target.startsWith(path.join(root, "assets") + path.sep) || !fs.existsSync(target)) errors.push(`${item.name}: afbeelding ontbreekt (${item[key]}).`);
      }
    }
    process.stdout.write(JSON.stringify(errors));
  } catch (error) { process.stdout.write(JSON.stringify(["Ongeldige Sammeltjesgegevens: " + error.message])); }
});
