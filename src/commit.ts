import { getPermanentCommitModel } from "./core/config.ts";
import { getGitSnapshot, type GitResult } from "./core/git.ts";
import { selectCommitDiff } from "./core/diff.ts";
import { buildCommitPrompt } from "./core/prompt.ts";
import { isCommitMessageTitleTooLong, parseCommitMessageOutput } from "./core/commit-message.ts";
import { sanitizeCommitMessage } from "./core/sanitize.ts";
import { selectCommitModel, type CommitModelLike } from "./core/model-selection.ts";

export type { GitResult } from "./core/git.ts";
export type { CommitModelLike } from "./core/model-selection.ts";
export { getPermanentCommitModel } from "./core/config.ts";
export { getGitSnapshot, runGit } from "./core/git.ts";
export { selectCommitDiff } from "./core/diff.ts";
export { buildCommitPrompt, COMMIT_PROMPT_MAX_DIFF_CHARS, TITLE_MAX_LENGTH as MAX_TITLE_LENGTH } from "./core/prompt.ts";
export { parseCommitMessageOutput } from "./core/commit-message.ts";
export { sanitizeCommitMessage } from "./core/sanitize.ts";
export { selectCommitModel, DEFAULT_CHEAP_MODEL_PATTERNS } from "./core/model-selection.ts";

export interface CommitContextLike {
  cwd: string;
  ui: {
    notify: (message: string, level?: string) => void;
    confirm: (title: string, message: string) => Promise<boolean>;
  };
  modelRegistry: {
    getAvailable: () => Promise<CommitModelLike[]>;
    authStorage: unknown;
  };
  model: CommitModelLike;
}

export interface ExtensionApiLike {
  registerFlag: (
    name: string,
    spec: { description: string; type: string },
  ) => void;
  registerCommand: (
    name: string,
    spec: {
      description: string;
      handler: (args: string, ctx: CommitContextLike) => Promise<void>;
    },
  ) => void;
  getFlag: (name: string) => unknown;
}

export type CommitSessionEvent = {
  type: string;
  assistantMessageEvent?: {
    type?: string;
    delta?: string;
  };
};

export type CommitSession = {
  subscribe: (listener: (event: CommitSessionEvent) => void) => void;
  prompt: (prompt: string) => Promise<void>;
};

function isTextDeltaEvent(event: CommitSessionEvent): event is CommitSessionEvent & {
  type: "message_update";
  assistantMessageEvent: {
    type: "text_delta";
    delta: string;
  };
} {
  return event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta" && typeof event.assistantMessageEvent.delta === "string";
}

export type CommitExtensionDeps = {
  runGit: typeof import("./core/git.ts").runGit;
  createAgentSession: (options: {
    cwd: string;
    agentDir: string;
    model: CommitModelLike;
    sessionManager: unknown;
    authStorage: unknown;
    modelRegistry: unknown;
    resourceLoader: unknown;
    noTools: "all";
  }) => Promise<{ session: CommitSession }>;
  createResourceLoader: (options: { cwd: string; agentDir: string }) => { reload: () => Promise<void> };
  createSessionManager: () => unknown;
  getAgentDir: () => string;
  appendDebugLog: (cwd: string, message: string) => Promise<void>;
};

export function createCommitCommandHandler(
  pi: ExtensionApiLike,
  deps: CommitExtensionDeps,
) {
  return async (args: string, ctx: CommitContextLike) => {
    const overrideModelId = args.trim();
    const { gitStatus, lastCommits, stagedDiff, unstagedDiff, untrackedDiff } = await getGitSnapshot(ctx.cwd, deps.runGit);

    if (gitStatus.status !== 0) {
      ctx.ui.notify("Not a git repository", "error");
      return;
    }

    const { diff, isStaged, includesUntracked } = selectCommitDiff(stagedDiff, unstagedDiff, untrackedDiff);

    if (!diff || diff.trim() === "") {
      ctx.ui.notify("No changes to commit", "warning");
      return;
    }

    const models = await ctx.modelRegistry.getAvailable();
    const flagModel = pi.getFlag("commit-model");
    const permanentModel = getPermanentCommitModel(deps.getAgentDir());
    const { model: selectedModel, overrideNotFound } = selectCommitModel({
      models,
      currentModel: ctx.model,
      overrideModelId,
      flagModel: typeof flagModel === "string" ? flagModel : undefined,
      permanentModel,
    });

    if (overrideNotFound) {
      ctx.ui.notify(`Model "${overrideModelId}" not found or not available.`, "warning");
    }

    if (!selectedModel) {
      ctx.ui.notify("No suitable model found to generate commit message", "error");
      return;
    }

    ctx.ui.notify(`Generating commit message using ${selectedModel.id}...`, "info");

    const prompt = buildCommitPrompt(lastCommits, diff);
    const log = async (message: string) => {
      try {
        await deps.appendDebugLog(ctx.cwd, message);
      } catch {
        // Ignore debug logging failures.
      }
    };

    const titleRetryPrompt =
      "The previous commit title was longer than 72 characters. Rewrite the commit message so the title is at most 72 characters. Preserve the body if possible. Return only the corrected commit message.";
    let commitMsg = "";
    let promptToSend = prompt;
    let titleRetryCount = 0;
    const maxTitleRetries = 1;
    try {
      const resourceLoader = deps.createResourceLoader({
        cwd: ctx.cwd,
        agentDir: deps.getAgentDir(),
      });
      await resourceLoader.reload();

      const { session } = await deps.createAgentSession({
        cwd: ctx.cwd,
        agentDir: deps.getAgentDir(),
        model: selectedModel,
        sessionManager: deps.createSessionManager(),
        authStorage: ctx.modelRegistry.authStorage,
        modelRegistry: ctx.modelRegistry,
        resourceLoader,
        noTools: "all",
      });

      session.subscribe((event) => {
        if (isTextDeltaEvent(event)) {
          commitMsg += event.assistantMessageEvent.delta;
        }
      });

      while (true) {
        commitMsg = "";
        await log(`\n\n[${new Date().toISOString()}] --- PROMPT SENT TO LLM${titleRetryCount > 0 ? ` (retry ${titleRetryCount})` : ""} ---`);
        await log(promptToSend);
        await log("--------------------------");

        await session.prompt(promptToSend);

        await log(`\n\n[${new Date().toISOString()}] --- LLM RESPONSE${titleRetryCount > 0 ? ` (retry ${titleRetryCount})` : ""} ---`);
        await log(commitMsg);
        await log("--------------------");

        if (isCommitMessageTitleTooLong(commitMsg)) {
          if (titleRetryCount >= maxTitleRetries) {
            ctx.ui.notify("Received commit message with a title longer than 72 characters", "error");
            return;
          }

          titleRetryCount += 1;
          promptToSend = titleRetryPrompt;
          continue;
        }

        commitMsg = parseCommitMessageOutput(commitMsg) ?? "";
        commitMsg = sanitizeCommitMessage(commitMsg);
        break;
      }
    } catch (error) {
      ctx.ui.notify(
        `Failed to generate commit message: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      return;
    }

    if (!commitMsg) {
      ctx.ui.notify("Received empty or invalid commit message from model", "error");
      return;
    }

    const confirmed = await ctx.ui.confirm("Commit changes?", `Generated commit message:\n\n${commitMsg}`);
    if (!confirmed) {
      ctx.ui.notify("Commit cancelled", "info");
      return;
    }

    if (!isStaged) {
      const addAll = await ctx.ui.confirm(
        "Stage changes?",
        includesUntracked
          ? "No files are staged. Stage all tracked and untracked changes before committing?"
          : "No files are staged. Stage all tracked changes before committing?",
      );
      if (!addAll) {
        ctx.ui.notify("Commit cancelled (files not staged)", "info");
        return;
      }

      const addResult = await deps.runGit(["add", "-A"], { cwd: ctx.cwd });
      if (addResult.status !== 0) {
        ctx.ui.notify(`Failed to stage changes: ${addResult.stderr}`, "error");
        return;
      }
    }

    const commitResult = await deps.runGit(["commit", "-m", commitMsg], { cwd: ctx.cwd, encoding: "utf-8" });
    if (commitResult.status === 0) {
      ctx.ui.notify("Changes committed successfully!", "success");
    } else {
      ctx.ui.notify(`Git commit failed:\n${commitResult.stderr}`, "error");
    }
  };
}

export function createCommitExtension(pi: ExtensionApiLike, deps: CommitExtensionDeps) {
  pi.registerFlag("commit-model", {
    description: "Default model to use for commit message generation",
    type: "string",
  });

  pi.registerCommand("commit", {
    description: "Generate a commit message and commit changes. Usage: /commit [model-id]",
    handler: createCommitCommandHandler(pi, deps),
  });
}
