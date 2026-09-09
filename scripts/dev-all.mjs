import { spawn } from "node:child_process";
import net from "node:net";

const commands = [
  {
    name: "backend",
    command: "npm",
    args: ["run", "dev"],
    cwd: new URL("../backend/", import.meta.url),
    port: 4100,
  },
  {
    name: "frontend",
    command: "npm",
    args: ["run", "dev"],
    cwd: new URL("../", import.meta.url),
    port: 3000,
  },
];

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

const children = [];

for (const { name, command, args, cwd, port } of commands) {
  if (await isPortOpen(port)) {
    console.log(`[${name}] already running on http://localhost:${port}`);
    continue;
  }

  const child = spawn(command, args, {
    cwd,
    env: process.env,
    shell: true,
    stdio: ["inherit", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
    }
    if (signal) {
      console.error(`[${name}] exited with signal ${signal}`);
    }
  });

  children.push(child);
}

if (children.length === 0) {
  console.log("JobNova frontend and backend are already running.");
}

function stopAll() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  }
}

process.on("SIGINT", () => {
  stopAll();
  setTimeout(() => process.exit(0), 300);
});
process.on("SIGTERM", () => {
  stopAll();
  setTimeout(() => process.exit(0), 300);
});
