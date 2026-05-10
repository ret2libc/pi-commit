import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { createCommitExtension, runGit } from "../commit.ts";

export function registerCommitCommand(pi: ExtensionAPI) {
  createCommitExtension(pi, {
    runGit,
    createAgentSession,
    createResourceLoader: ({ cwd, agentDir }) =>
      new DefaultResourceLoader({
        cwd,
        agentDir,
        systemPromptOverride: () => "You are a helpful assistant.",
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noContextFiles: true,
      }),
    createSessionManager: () => SessionManager.inMemory(),
    getAgentDir,
    appendDebugLog: async (cwd, message) => {
      await appendFile(join(cwd, "pi-commit-debug.log"), `${message}\n`);
    },
  });
}

export default registerCommitCommand;
