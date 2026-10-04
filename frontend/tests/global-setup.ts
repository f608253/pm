import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..");
const dbPath = path.join(repoRoot, "data", "kanban.db");

const dockerCompose = (args: string[]) =>
  execFileSync("docker", ["compose", ...args], {
    cwd: repoRoot,
    stdio: "ignore",
  });

// The suite signs in as the demo user, so every run shares one database. A run
// that fails part way through leaves renamed columns and moved cards behind, and
// the next run then fails for reasons that have nothing to do with the code.
// Recreating the file makes the seed the single starting state.
const waitForHealth = async (baseURL: string) => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseURL}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Uvicorn has not bound the port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Backend did not become healthy at ${baseURL}.`);
};

export default async function globalSetup() {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8000";

  dockerCompose(["stop", "backend"]);
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
  dockerCompose(["up", "-d", "backend"]);
  await waitForHealth(baseURL);
}
