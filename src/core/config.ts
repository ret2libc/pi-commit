import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function getPermanentCommitModel(agentDir: string): string | undefined {
  try {
    const configPath = join(agentDir, "pi-commit.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      return typeof config.model === "string" && config.model.trim() ? config.model : undefined;
    }
  } catch {
    // Ignore config read errors.
  }

  return undefined;
}
