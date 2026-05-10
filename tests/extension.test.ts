import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCommitExtension, type CommitModelLike, runGit } from "../src/commit.ts";

function fixture(name: string) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", name), "utf-8");
}

async function runEntrypointSmokeTest() {
  const registrations: Array<{ kind: string; name: string }> = [];
  const mod = await import("../src/index.ts");

  assert.equal(typeof mod.default, "function");

  mod.default({
    registerFlag(name: string) {
      registrations.push({ kind: "flag", name });
    },
    registerCommand(name: string, _spec: { description: string; handler: (args: string, ctx: any) => Promise<void> }) {
      registrations.push({ kind: "command", name });
    },
  } as any);

  assert.deepEqual(registrations, [
    { kind: "flag", name: "commit-model" },
    { kind: "command", name: "commit" },
  ]);
}

async function runScenario(options: {
  name: string;
  responseText?: string;
  responseTexts?: string[];
  expectedCommitMessage: string;
  expectedPromptCount?: number;
  expectedFollowUpPromptIncludes?: string;
  stagedDiff?: boolean;
  modifyTrackedFile?: boolean;
  untrackedFiles?: Array<{ name: string; content: string }>;
  overrideArgs?: string;
  expectedSelectedModelId?: string;
}) {
  const tmpDir = mkdtempSync(join(tmpdir(), `pi-commit-test-${options.name}-`));
  const projectDir = join(tmpDir, "project");
  const agentDir = join(tmpDir, "agent");
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(agentDir, { recursive: true });

  try {
    spawnSync("git", ["init"], { cwd: projectDir, stdio: "ignore" });
    spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: projectDir, stdio: "ignore" });
    spawnSync("git", ["config", "user.name", "Test User"], { cwd: projectDir, stdio: "ignore" });

    writeFileSync(join(projectDir, "initial.txt"), "hello");
    spawnSync("git", ["add", "initial.txt"], { cwd: projectDir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "initial commit"], { cwd: projectDir, stdio: "ignore" });

    if (options.modifyTrackedFile !== false) {
      writeFileSync(join(projectDir, "initial.txt"), "hello world changed");
    }
    for (const untrackedFile of options.untrackedFiles ?? []) {
      writeFileSync(join(projectDir, untrackedFile.name), untrackedFile.content);
    }
    if (options.stagedDiff) {
      spawnSync("git", ["add", "initial.txt"], { cwd: projectDir, stdio: "ignore" });
    }

    const models: CommitModelLike[] = JSON.parse(fixture("models.json"));
    const notifications: Array<{ message: string; level?: string }> = [];
    const confirms: Array<{ title: string; message: string }> = [];
    const promptMessages: string[] = [];
    let confirmCount = 0;
    let promptCount = 0;
    let registeredHandler: ((args: string, ctx: any) => Promise<void>) | undefined;
    let subscribedListener: ((event: any) => void) | undefined;
    let createSessionOptions: any;

    const pi = {
      registerFlag: () => {},
      registerCommand(_name: string, spec: { description: string; handler: (args: string, ctx: any) => Promise<void> }) {
        registeredHandler = spec.handler;
      },
      getFlag: () => undefined,
    };

    createCommitExtension(pi, {
      runGit,
      createAgentSession: async (sessionOptions: any) => {
        createSessionOptions = sessionOptions;
        return {
          session: {
            subscribe(listener: (event: any) => void) {
              subscribedListener = listener;
            },
            prompt: async (prompt: string) => {
              promptMessages.push(prompt);
              const responseText = options.responseTexts?.[promptCount] ?? options.responseText ?? "";
              promptCount += 1;
              subscribedListener?.({
                type: "message_update",
                assistantMessageEvent: {
                  type: "text_delta",
                  delta: responseText,
                },
              });
            },
          },
        };
      },
      createResourceLoader: () => ({
        reload: async () => {},
      }),
      createSessionManager: () => ({ inMemory: true }),
      getAgentDir: () => agentDir,
      appendDebugLog: async () => {},
    });

    assert.equal(typeof registeredHandler, "function");

    const ctx = {
      cwd: projectDir,
      model: models[0],
      modelRegistry: {
        getAvailable: async () => models,
        authStorage: { token: "test" },
      },
      ui: {
        notify(message: string, level?: string) {
          notifications.push({ message, level });
        },
        confirm: async (title: string, message: string) => {
          confirmCount += 1;
          confirms.push({ title, message });
          return true;
        },
      },
    };

    await registeredHandler?.(options.overrideArgs ?? "", ctx);

    const lastCommitMsg = spawnSync("git", ["log", "-1", "--format=%B"], {
      cwd: projectDir,
      encoding: "utf-8",
    }).stdout.trim();

    assert.equal(lastCommitMsg, options.expectedCommitMessage);
    assert.equal(createSessionOptions.model.id, options.expectedSelectedModelId ?? "openai/gpt-5-mini");
    assert.equal(createSessionOptions.noTools, "all");
    assert.equal(promptMessages.length, options.expectedPromptCount ?? 1);
    assert.ok(promptMessages[0].includes("Current diff:"));
    if (options.expectedFollowUpPromptIncludes) {
      assert.ok(promptMessages[1].includes(options.expectedFollowUpPromptIncludes));
    }
    if (options.untrackedFiles?.length) {
      for (const untrackedFile of options.untrackedFiles) {
        assert.ok(promptMessages[0].includes(untrackedFile.name));
      }
    }

    assert.deepEqual(confirms[0], {
      title: "Commit changes?",
      message: `Generated commit message:\n\n${options.expectedCommitMessage}`,
    });

    if (options.stagedDiff) {
      assert.equal(confirmCount, 1);
      assert.equal(confirms.length, 1);
    } else {
      const expectedStageMessage = options.untrackedFiles?.length
        ? "No files are staged. Stage all tracked and untracked changes before committing?"
        : "No files are staged. Stage all tracked changes before committing?";
      assert.equal(confirmCount, 2);
      assert.deepEqual(confirms[1], {
        title: "Stage changes?",
        message: expectedStageMessage,
      });
    }

    assert.ok(notifications.some((item) => item.message === "Changes committed successfully!"));

    if (options.untrackedFiles?.length) {
      const committedFiles = spawnSync("git", ["show", "--pretty=", "--name-only", "HEAD"], {
        cwd: projectDir,
        encoding: "utf-8",
      }).stdout
        .split("\n")
        .map((line) => line.replace(/\r$/, ""))
        .filter((line) => line.length > 0);
      for (const untrackedFile of options.untrackedFiles) {
        assert.ok(committedFiles.includes(untrackedFile.name));
      }
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function runNoChangesTest() {
  const tmpDir = mkdtempSync(join(tmpdir(), "pi-commit-empty-"));
  const projectDir = join(tmpDir, "project");
  const agentDir = join(tmpDir, "agent");
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(agentDir, { recursive: true });

  try {
    spawnSync("git", ["init"], { cwd: projectDir, stdio: "ignore" });
    spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: projectDir, stdio: "ignore" });
    spawnSync("git", ["config", "user.name", "Test User"], { cwd: projectDir, stdio: "ignore" });

    const models: CommitModelLike[] = JSON.parse(fixture("models.json"));
    let createSessionCalled = false;
    let getAvailableCalled = false;
    const notifications: Array<{ message: string; level?: string }> = [];
    let handler: ((args: string, ctx: any) => Promise<void>) | undefined;

    const pi = {
      registerFlag: () => {},
      registerCommand(_name: string, spec: { description: string; handler: (args: string, ctx: any) => Promise<void> }) {
        handler = spec.handler;
      },
      getFlag: () => undefined,
    };

    createCommitExtension(pi, {
      runGit: async (args: string[]) => {
        if (args[0] === "rev-parse") {
          return { status: 0, stdout: "true\n", stderr: "" };
        }
        if (args[0] === "log") {
          return { status: 0, stdout: fixture("history.txt"), stderr: "" };
        }
        if (args[0] === "diff") {
          return { status: 0, stdout: "", stderr: "" };
        }
        if (args[0] === "ls-files") {
          return { status: 0, stdout: "", stderr: "" };
        }
        throw new Error(`Unexpected git args: ${args.join(" ")}`);
      },
      createAgentSession: async () => {
        createSessionCalled = true;
        return {
          session: {
            subscribe() {},
            prompt: async () => {},
          },
        };
      },
      createResourceLoader: () => ({ reload: async () => {} }),
      createSessionManager: () => ({}),
      getAgentDir: () => agentDir,
      appendDebugLog: async () => {},
    });

    const ctx = {
      cwd: projectDir,
      model: models[0],
      modelRegistry: {
        getAvailable: async () => {
          getAvailableCalled = true;
          return models;
        },
        authStorage: {},
      },
      ui: {
        notify(message: string, level?: string) {
          notifications.push({ message, level });
        },
        confirm: async () => true,
      },
    };

    await handler?.("", ctx);

    assert.equal(createSessionCalled, false);
    assert.equal(getAvailableCalled, false);
    assert.deepEqual(notifications, [{ message: "No changes to commit", level: "warning" }]);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function runExtensionTests() {
  await runEntrypointSmokeTest();

  await runScenario({
    name: "structured-output",
    responseText: fixture("structured-message.json"),
    expectedCommitMessage: "feat: move commit prompt into a file\n\nAdd structured JSON parsing with raw-output fallback.",
  });

  await runScenario({
    name: "long-title-retry",
    responseTexts: [
      JSON.stringify({
        title:
          "feat: this title is intentionally far longer than seventy-two characters so the model should retry",
        body: "This is the first attempt.",
      }),
      JSON.stringify({
        title: "feat: retry with a shorter title",
        body: "This is the corrected message.",
      }),
    ],
    expectedCommitMessage: "feat: retry with a shorter title\n\nThis is the corrected message.",
    expectedPromptCount: 2,
    expectedFollowUpPromptIncludes: "72 characters",
  });

  await runScenario({
    name: "freeform-output",
    responseText: fixture("fenced-message.txt"),
    expectedCommitMessage: "feat: update initial.txt to say hello world",
  });

  await runScenario({
    name: "staged-output",
    responseText: fixture("fenced-message.txt"),
    expectedCommitMessage: "feat: update initial.txt to say hello world",
    stagedDiff: true,
  });

  await runScenario({
    name: "override-model-output",
    responseText: fixture("fenced-message.txt"),
    expectedCommitMessage: "feat: update initial.txt to say hello world",
    overrideArgs: "claude",
    expectedSelectedModelId: "anthropic/claude-3.5-sonnet",
  });

  await runScenario({
    name: "untracked-output",
    responseText: fixture("fenced-message.txt"),
    expectedCommitMessage: "feat: update initial.txt to say hello world",
    untrackedFiles: [{ name: "new-file.txt", content: "brand new file\n" }],
  });

  await runScenario({
    name: "untracked-whitespace-path",
    responseText: fixture("fenced-message.txt"),
    expectedCommitMessage: "feat: update initial.txt to say hello world",
    modifyTrackedFile: false,
    untrackedFiles: [{ name: " leading.txt", content: "brand new file\n" }],
  });

  await runNoChangesTest();
}
