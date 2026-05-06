import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  AuthStorage,
  ModelRegistry,
} from "@mariozechner/pi-coding-agent";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

async function runTest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-commit-test-"));
  const projectDir = path.join(tmpDir, "project");
  fs.mkdirSync(projectDir);

  console.log(`Testing in ${projectDir}`);

  // 1. Initialize git repo
  spawnSync("git", ["init"], { cwd: projectDir });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: projectDir });
  spawnSync("git", ["config", "user.name", "Test User"], { cwd: projectDir });

  // 2. Add initial file and commit
  fs.writeFileSync(path.join(projectDir, "initial.txt"), "hello");
  spawnSync("git", ["add", "initial.txt"], { cwd: projectDir });
  spawnSync("git", ["commit", "-m", "initial commit"], { cwd: projectDir });

  // 3. Modify file
  fs.writeFileSync(path.join(projectDir, "initial.txt"), "hello world changed");
  // Don't stage it, to test the extension's staging prompt
  // Don't stage it, to test the extension's staging prompt

  // 4. Setup Pi with the extension
  const authStorage = AuthStorage.inMemory();
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  
  // Register a mock model
  modelRegistry.registerProvider("mock", {
    baseUrl: "http://localhost",
    apiKey: "mock",
    api: "openai-completions",
    models: [
      {
        id: "mock-mini-model",
        name: "Mock Mini",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000,
        maxTokens: 100,
      }
    ]
  });

  const extensionPath = path.resolve("src/index.ts");
  const resourceLoader = new DefaultResourceLoader({
    cwd: projectDir,
    agentDir: tmpDir,
    additionalExtensionPaths: [extensionPath],
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: projectDir,
    resourceLoader,
    modelRegistry,
    authStorage,
    sessionManager: SessionManager.inMemory(),
  });

  // Mock UI
  let confirmCallCount = 0;
  const mockUI = {
    notify: (msg: string) => console.log(`[UI NOTIFY] ${msg}`),
    confirm: async (title: string, msg: string) => {
      confirmCallCount++;
      console.log(`[UI CONFIRM] ${title}: ${msg}`);
      return true; // Always confirm
    },
    select: async () => undefined,
    input: async () => undefined,
    setStatus: () => {},
    setWorkingMessage: () => {},
    setWidget: () => {},
    setTitle: () => {},
  };

  await session.bindExtensions({
    uiContext: mockUI as any,
  });

  // 5. Run the /commit command
  // We need to mock the LLM response for the nested session
  // Since we are using a real modelRegistry, createAgentSession will try to call the real provider.
  // A better way is to mock the model provider response.
  // For this test, we'll just mock the prompt method or the underlying agent's completion.
  
  console.log("Executing /commit command...");
  
  // We want to intercept the internal session created by the extension.
  // This is tricky without modifying the extension code to allow injection.
  // However, we can mock the modelRegistry.getApiKeyAndHeaders to return something that doesn't fail immediately
  // or use a provider that we can control.
  
  // Alternative: Mock 'createAgentSession' export if we were using a test runner like vitest/jest.
  // Here we'll do a simple integration test and expect it to fail at the LLM call, 
  // OR we can mock the global fetch to return a fixed commit message.
  
  const originalFetch = global.fetch;
  global.fetch = (async (url: string) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "feat: update initial.txt to say hello world" } }]
      }),
      headers: new Headers(),
      body: new ReadableStream({
        start(controller) {
          const chunk = JSON.stringify({
            choices: [{ delta: { content: "feat: update initial.txt to say hello world" } }]
          });
          controller.enqueue(new TextEncoder().encode(`data: ${chunk}\n\ndata: [DONE]\n\n`));
          controller.close();
        }
      })
    };
  }) as any;

  try {
    await session.prompt("/commit");

    // 6. Verify results
    const lastCommitMsg = spawnSync("git", ["log", "-1", "--format=%B"], { cwd: projectDir, encoding: "utf-8" }).stdout.trim();
    console.log(`Last commit message: ${lastCommitMsg}`);
    
    if (lastCommitMsg === "feat: update initial.txt to say hello world") {
      console.log("SUCCESS: Commit message matches expected mock output.");
    } else {
      console.error(`FAILURE: Commit message was "${lastCommitMsg}"`);
      process.exit(1);
    }
    
    if (confirmCallCount < 2) {
        console.error(`FAILURE: Expected at least 2 confirmations (stage + commit), got ${confirmCallCount}`);
        process.exit(1);
    }

  } finally {
    global.fetch = originalFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
