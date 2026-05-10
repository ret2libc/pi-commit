import { readFileSync } from "node:fs";

const COMMIT_PROMPT_PATH = new URL("../../prompts/commit-message.md", import.meta.url);
const MAX_TITLE_LENGTH = 72;
const MAX_DIFF_CHARS = 20000;
const TEMPLATE = readFileSync(COMMIT_PROMPT_PATH, "utf-8");

export function buildCommitPrompt(lastCommits: string, diff: string): string {
  const truncatedDiff = diff.slice(0, MAX_DIFF_CHARS);
  const diffPreview = truncatedDiff + (diff.length > MAX_DIFF_CHARS ? "\n...(diff truncated)..." : "");

  return TEMPLATE
    .replaceAll("{{TITLE_MAX_LENGTH}}", String(MAX_TITLE_LENGTH))
    .replaceAll("{{LAST_COMMITS}}", lastCommits.trim() || "(none)")
    .replaceAll("{{DIFF}}", diffPreview || "(empty)");
}

export { MAX_DIFF_CHARS as COMMIT_PROMPT_MAX_DIFF_CHARS, MAX_TITLE_LENGTH };
