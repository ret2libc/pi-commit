import { sanitizeCommitMessage, stripUnsafeCharacters } from "./sanitize.ts";

const MAX_TITLE_LENGTH = 72;

export function parseCommitMessageOutput(raw: string): string | null {
  const structured = parseStructuredCommitMessage(raw);
  if (structured) {
    return formatStructuredCommitMessage(structured);
  }

  const fallback = sanitizeCommitMessage(raw);
  return fallback.length > 0 ? fallback : null;
}

function parseStructuredCommitMessage(raw: string): { title: string; body?: string } | null {
  const candidate = unwrapFence(raw).trim();
  const jsonText = extractJsonObject(candidate);
  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const title = sanitizeCommitTitle(typeof parsed.title === "string" ? parsed.title : "");
    if (!title) {
      return null;
    }

    const body = typeof parsed.body === "string" ? sanitizeCommitBody(parsed.body) : "";
    return body ? { title, body } : { title };
  } catch {
    return null;
  }
}

function formatStructuredCommitMessage(message: { title: string; body?: string }): string {
  return message.body ? `${message.title}\n\n${message.body}` : message.title;
}

function sanitizeCommitTitle(title: string): string {
  const clean = sanitizeLooseText(title).replace(/\s+/g, " ").trim();
  if (!clean) {
    return "";
  }

  return clean.length > MAX_TITLE_LENGTH ? clean.slice(0, MAX_TITLE_LENGTH).trimEnd() : clean;
}

function sanitizeCommitBody(body: string): string {
  return sanitizeLooseText(body)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeLooseText(text: string): string {
  return stripUnsafeCharacters(text).trim();
}

function unwrapFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:[a-z0-9_-]+)?\s*\n([\s\S]*?)\n```$/i);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return null;
  }

  return trimmed.slice(start, end + 1);
}
