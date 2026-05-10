import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildCommitPrompt,
  COMMIT_PROMPT_MAX_DIFF_CHARS,
  getPermanentCommitModel,
  parseCommitMessageOutput,
  sanitizeCommitMessage,
  selectCommitDiff,
  selectCommitModel,
} from "../src/commit.ts";

function fixture(name: string) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", name), "utf-8");
}

export async function runHelperTests() {
  const models = JSON.parse(fixture("models.json"));
  const activeModel = models[0];

  assert.equal(sanitizeCommitMessage(fixture("fenced-message.txt")), "feat: update initial.txt to say hello world");

  assert.equal(
    parseCommitMessageOutput(fixture("structured-message.json")),
    "feat: move commit prompt into a file\n\nAdd structured JSON parsing with raw-output fallback.",
  );
  assert.equal(parseCommitMessageOutput("fix: accept freeform commit output"), "fix: accept freeform commit output");
  assert.equal(
    parseCommitMessageOutput('feat: add object support\n\nSee example:\n{"title":"ignore me"}'),
    'feat: add object support\n\nSee example:\n{"title":"ignore me"}',
  );

  const longStructuredTitle = parseCommitMessageOutput(JSON.stringify({
    title: "x".repeat(80),
    body: "body",
  }));
  assert.equal(longStructuredTitle?.split("\n\n")[0].length, 72);
  assert.equal(longStructuredTitle?.split("\n\n")[0], "x".repeat(72));

  const longFreeformTitle = parseCommitMessageOutput("y".repeat(90));
  assert.equal(longFreeformTitle?.length, 72);
  assert.equal(longFreeformTitle, "y".repeat(72));

  const prompt = buildCommitPrompt(fixture("history.txt"), fixture("unstaged.diff"));
  assert.ok(prompt.includes("Return a single JSON object with exactly these keys:"));
  assert.ok(prompt.includes("Recent commit messages:\n" + fixture("history.txt")));
  assert.ok(prompt.includes("Current diff:\n```diff\n" + fixture("unstaged.diff") + "\n```"));
  assert.ok(prompt.includes("The title must be at most 72 characters."));

  const longDiff = fixture("unstaged.diff") + "\n" + "x".repeat(COMMIT_PROMPT_MAX_DIFF_CHARS + 123);
  const truncatedPrompt = buildCommitPrompt("history", longDiff);
  assert.ok(truncatedPrompt.includes("...(diff truncated)..."));
  assert.ok(truncatedPrompt.includes(longDiff.slice(0, COMMIT_PROMPT_MAX_DIFF_CHARS)));

  assert.deepEqual(selectCommitDiff("diff --git a/file b/file\n", "unstaged"), {
    diff: "diff --git a/file b/file\n",
    isStaged: true,
    includesUntracked: false,
  });
  assert.deepEqual(selectCommitDiff("   ", "unstaged"), {
    diff: "unstaged",
    isStaged: false,
    includesUntracked: false,
  });
  assert.deepEqual(selectCommitDiff("", "unstaged", "diff --git a/new-file.txt b/new-file.txt\n"), {
    diff: "unstaged\ndiff --git a/new-file.txt b/new-file.txt\n",
    isStaged: false,
    includesUntracked: true,
  });

  assert.equal(
    selectCommitModel({
      models,
      currentModel: activeModel,
      overrideModelId: "gemini",
    }).model.id,
    "google/gemini-2.0-flash",
  );

  assert.equal(
    selectCommitModel({
      models,
      currentModel: activeModel,
      flagModel: "claude",
      permanentModel: "gpt-5",
    }).model.id,
    "anthropic/claude-3.5-sonnet",
  );

  assert.equal(
    selectCommitModel({
      models,
      currentModel: activeModel,
      permanentModel: "does-not-exist",
    }).model.id,
    "openai/gpt-5-mini",
  );

  const tempAgentDir = mkdtempSync(join(tmpdir(), "pi-commit-helper-"));
  try {
    writeFileSync(join(tempAgentDir, "pi-commit.json"), fixture("pi-commit.json"));
    assert.equal(getPermanentCommitModel(tempAgentDir), "claude");

    writeFileSync(join(tempAgentDir, "pi-commit.json"), JSON.stringify({ model: " claude " }));
    assert.equal(getPermanentCommitModel(tempAgentDir), "claude");
    rmSync(join(tempAgentDir, "pi-commit.json"));
    assert.equal(getPermanentCommitModel(tempAgentDir), undefined);
  } finally {
    rmSync(tempAgentDir, { recursive: true, force: true });
  }
}
