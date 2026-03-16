const { spawn } = require("child_process");
const path = require("path");

const root = __dirname;
const serverDir = path.join(root, "server");
const clientDir = path.join(root, "client");

// Kompilujemy serwer przed uruchomieniem (ts-node crashuje cicho na Windows)
const { execSync } = require("child_process");
execSync("npx tsc -p tsconfig.server.json", { cwd: root, stdio: "inherit" });

const server = spawn("node", ["dist/server/index.js"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, DASHBOARD_ROOT: root },
  shell: true,
});

const client = spawn("npm", ["run", "dev"], {
  cwd: clientDir,
  stdio: "inherit",
  shell: true,
});

function killAll() {
  server.kill();
  client.kill();
  process.exit(0);
}

process.on("SIGINT", killAll);
process.on("SIGTERM", killAll);
