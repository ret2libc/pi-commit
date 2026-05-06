import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";
import { spawnSync } from "node:child_process";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("commit", {
    description: "Generate a commit message and commit changes",
    handler: async (_args, ctx) => {
      // 1. Check if it's a git repo
      const gitStatus = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf-8" });
      if (gitStatus.status !== 0) {
        ctx.ui.notify("Not a git repository", "error");
        return;
      }

      // 2. Get last 5 commit messages
      const lastCommits = spawnSync(
        "git",
        ["log", "-n", "5", "--no-merges", "--invert-grep", "--grep=dependabot", "--format=%B%n---"],
        { encoding: "utf-8", cwd: ctx.cwd }
      ).stdout;

      // 3. Get diff
      const stagedDiff = spawnSync("git", ["diff", "--staged"], { encoding: "utf-8", cwd: ctx.cwd }).stdout;
      const unstagedDiff = spawnSync("git", ["diff"], { encoding: "utf-8", cwd: ctx.cwd }).stdout;

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
      // Try to find a smaller/cheaper model (gpt-4o-mini, haiku, flash, etc.)
      const miniModel = models.find(m =>
        m.id.toLowerCase().includes("gpt-5-mini") ||
        m.id.toLowerCase().includes("mini") ||
        m.id.toLowerCase().includes("haiku") ||
        m.id.toLowerCase().includes("flash") ||
        m.id.toLowerCase().includes("llama-3-8b") ||
        m.id.toLowerCase().includes("llama-3.1-8b")
      ) || ctx.model;

      if (!miniModel) {
        ctx.ui.notify("No suitable model found to generate commit message", "error");
        return;
      }

      ctx.ui.notify(`Generating commit message using ${miniModel.id}...`, "info");

      const prompt = `You are an expert at writing git commit messages.
Based on the following last 5 commit messages and the current diff, provide a meaningful, concise commit message.
Follow the project style seen in the history.
Return ONLY the commit message, no other text or markdown formatting.

Last commit messages:
${lastCommits}

Current diff:
${diff.slice(0, 20000)} ${diff.length > 20000 ? "\n...(diff truncated)..." : ""}
`;

      let commitMsg = "";
      try {
        const { session } = await createAgentSession({
          model: miniModel,
          sessionManager: SessionManager.inMemory(),
          authStorage: ctx.modelRegistry.authStorage,
          modelRegistry: ctx.modelRegistry,
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
            const addResult = spawnSync("git", ["add", "-u"], { cwd: ctx.cwd });
            if (addResult.status !== 0) {
              ctx.ui.notify(`Failed to stage changes: ${addResult.stderr}`, "error");
              return;
            }
          } else {
            ctx.ui.notify("Commit cancelled (files not staged)", "info");
            return;
          }
        }

        const commitResult = spawnSync("git", ["commit", "-m", commitMsg], { encoding: "utf-8", cwd: ctx.cwd });
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
