import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createAgentSession, SessionManager, DefaultResourceLoader, getAgentDir } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

async function runGit(args: string[], options: { cwd?: string; encoding?: BufferEncoding } = {}) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn("git", args, { cwd: options.cwd });
    let stdout = "";
    let stderr = "";
    if (child.stdout) {
      child.stdout.setEncoding(options.encoding ?? "utf-8");
      child.stdout.on("data", (chunk: string) => (stdout += chunk));
    }
    if (child.stderr) {
      child.stderr.setEncoding(options.encoding ?? "utf-8");
      child.stderr.on("data", (chunk: string) => (stderr += chunk));
    }
    child.on("error", (err) => {
      resolve({ status: null, stdout, stderr: String(err) });
    });
    child.on("close", (code) => {
      resolve({ status: code ?? null, stdout, stderr });
    });
  });
}

export default function (pi: ExtensionAPI) {
  pi.registerFlag("commit-model", {
    description: "Default model to use for commit message generation",
    type: "string",
  });

  const getPermanentModel = (): string | undefined => {
    try {
      const configPath = join(getAgentDir(), "pi-commit.json");
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        return config.model;
      }
    } catch (e) {
      // Ignore config read errors
    }
    return undefined;
  };

  pi.registerCommand("commit", {
    description: "Generate a commit message and commit changes. Usage: /commit [model-id]",
    handler: async (args, ctx) => {
      const overrideModelId = args.trim();
      // 1. Check if it's a git repo
      const gitStatus = await runGit(["rev-parse", "--is-inside-work-tree"], { cwd: ctx.cwd, encoding: "utf-8" });
      if (gitStatus.status !== 0) {
        ctx.ui.notify("Not a git repository", "error");
        return;
      }

      // 2. Get last 5 commit messages
      const lastCommits = (await runGit(
        ["log", "-n", "5", "--no-merges", "--invert-grep", "--grep=dependabot", "--format=%B%n---"],
        { encoding: "utf-8", cwd: ctx.cwd }
      )).stdout;

      // 3. Get diff
      const stagedDiff = (await runGit(["diff", "--staged"], { encoding: "utf-8", cwd: ctx.cwd })).stdout;
      const unstagedDiff = (await runGit(["diff"], { encoding: "utf-8", cwd: ctx.cwd })).stdout;

      let diff = stagedDiff;
      let isStaged = true;
      if (!diff || diff.trim() === "") {
        diff = unstagedDiff;
        isStaged = false;
      }

      if (!diff || diff.trim() === "") {
        ctx.ui.notify("No changes to commit", "warning");
        return;
      }

      // 4. Find a "cheap" model
      const models = await ctx.modelRegistry.getAvailable();
      let miniModel = ctx.model;

      if (overrideModelId) {
        const found = models.find((m) => m.id.toLowerCase().includes(overrideModelId.toLowerCase()));
        if (found) {
          miniModel = found;
        } else {
          ctx.ui.notify(`Model "${overrideModelId}" not found or not available.`, "warning");
        }
      } else {
        // Try flag first, then permanent config, then hardcoded patterns
        const flagModel = pi.getFlag("commit-model");
        const permanentModel = getPermanentModel();
        const preferredModel = (typeof flagModel === "string" ? flagModel : permanentModel);

        if (preferredModel) {
          const found = models.find((m) => m.id.toLowerCase().includes(preferredModel.toLowerCase()));
          if (found) {
            miniModel = found;
          }
        }

        if (miniModel === ctx.model) {
          // Try to find a smaller/cheaper model, prioritizing gpt-5-mini
          const cheapPatterns = ["gpt-5-mini", "mini", "haiku", "flash", "llama-3-8b", "llama-3.1-8b"];

          for (const pattern of cheapPatterns) {
            const found = models.find((m) => m.id.toLowerCase().includes(pattern));
            if (found) {
              miniModel = found;
              break;
            }
          }
        }
      }

      if (!miniModel) {
        ctx.ui.notify("No suitable model found to generate commit message", "error");
        return;
      }

      ctx.ui.notify(`Generating commit message using ${miniModel.id}...`, "info");

      ctx.ui.notify(`Generating commit message using ${miniModel.id}...`, "info");

      const prompt = `You are an expert at writing git commit messages.
Based on the following last 5 commit messages and the current diff, provide a meaningful, concise commit message.
Follow the project style seen in the history.
The first line (title) must be at most 72 characters long.
Return ONLY the commit message, no other text or markdown formatting.

Last commit messages:
${lastCommits}

Current diff:
${diff.slice(0, 20000)} ${diff.length > 20000 ? "\n...(diff truncated)..." : ""}
`;

      let commitMsg = "";
      try {
        const resourceLoader = new DefaultResourceLoader({
          cwd: ctx.cwd,
          agentDir: getAgentDir(),
          systemPromptOverride: () => "You are a helpful assistant.",
          noExtensions: true,
          noSkills: true,
          noPromptTemplates: true,
          noContextFiles: true,
        });
        await resourceLoader.reload();

        const { session } = await createAgentSession({
          cwd: ctx.cwd,
          agentDir: getAgentDir(),
          model: miniModel,
          sessionManager: SessionManager.inMemory(),
          authStorage: ctx.modelRegistry.authStorage,
          modelRegistry: ctx.modelRegistry,
          resourceLoader,
          noTools: "all",
        });

        session.subscribe((event) => {
          if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
            commitMsg += event.assistantMessageEvent.delta;
          }
        });

        await session.prompt(prompt);
      } catch (err) {
        ctx.ui.notify(`Failed to generate commit message: ${err instanceof Error ? err.message : String(err)}`, "error");
        return;
      }

      commitMsg = commitMsg.trim();
      // Remove potential markdown code block wrapping
      if (commitMsg.startsWith("```")) {
        commitMsg = commitMsg.replace(/^```[a-z]*\n/i, "").replace(/\n```$/i, "").trim();
      }

      if (!commitMsg) {
        ctx.ui.notify("Received empty commit message from model", "error");
        return;
      }

      // 5. Confirm and Commit
      const confirmed = await ctx.ui.confirm("Commit changes?", `Generated commit message:\n\n${commitMsg}`);
      if (confirmed) {
        if (!isStaged) {
          const addAll = await ctx.ui.confirm("Stage changes?", "No files are staged. Stage all tracked changes before committing?");
          if (addAll) {
            const addResult = await runGit(["add", "-u"], { cwd: ctx.cwd });
            if (addResult.status !== 0) {
              ctx.ui.notify(`Failed to stage changes: ${addResult.stderr}`, "error");
              return;
            }
          } else {
            ctx.ui.notify("Commit cancelled (files not staged)", "info");
            return;
          }
        }

        const commitResult = await runGit(["commit", "-m", commitMsg], { encoding: "utf-8", cwd: ctx.cwd });
        if (commitResult.status === 0) {
          ctx.ui.notify("Changes committed successfully!", "success");
        } else {
          ctx.ui.notify(`Git commit failed:\n${commitResult.stderr}`, "error");
        }
      } else {
        ctx.ui.notify("Commit cancelled", "info");
      }
    },
  });
}
