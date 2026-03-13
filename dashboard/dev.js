const { spawn } = require("child_process");
const path = require("path");

const root = __dirname;
const serverDir = path.join(root, "server");
const clientDir = path.join(root, "client");

const server = spawn("npx", ["ts-node", "server/index.ts"], {
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
