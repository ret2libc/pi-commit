import { TITLE_MAX_LENGTH } from "./prompt.ts";
import { sanitizeCommitMessage, stripUnsafeCharacters } from "./sanitize.ts";

export function parseCommitMessageOutput(raw: string): string | null {
  const structured = parseStructuredCommitMessage(raw);
  if (structured) {
    return formatStructuredCommitMessage(structured);
  }

  const fallback = sanitizeCommitMessage(raw);
  return fallback.length > 0 ? fallback : null;
}

export function isCommitMessageTitleTooLong(raw: string): boolean {
  const structuredTitle = readStructuredCommitTitle(raw);
  if (structuredTitle !== null) {
    return structuredTitle.length > TITLE_MAX_LENGTH;
  }

  const freeformTitle = readFreeformCommitTitle(raw);
  return freeformTitle.length > TITLE_MAX_LENGTH;
}

function parseStructuredCommitMessage(raw: string): { title: string; body?: string } | null {
  const candidate = unwrapFence(raw).trim();
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
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

function readStructuredCommitTitle(raw: string): string | null {
  const candidate = unwrapFence(raw).trim();
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    return typeof parsed.title === "string" ? normalizeCommitTitle(parsed.title) : "";
  } catch {
    return null;
  }
}

function readFreeformCommitTitle(raw: string): string {
  const candidate = unwrapFence(raw);
  const clean = sanitizeLooseText(candidate);
  if (!clean) {
    return "";
  }

  const firstLineBreak = clean.indexOf("\n");
  const title = firstLineBreak === -1 ? clean : clean.slice(0, firstLineBreak);
  return title.trim();
}

function formatStructuredCommitMessage(message: { title: string; body?: string }): string {
  return message.body ? `${message.title}\n\n${message.body}` : message.title;
}

function sanitizeCommitTitle(title: string): string {
  const clean = normalizeCommitTitle(title);
  if (!clean) {
    return "";
  }

  return clean.length > TITLE_MAX_LENGTH ? clean.slice(0, TITLE_MAX_LENGTH).trimEnd() : clean;
}

function normalizeCommitTitle(title: string): string {
  return sanitizeLooseText(title).replace(/\s+/g, " ").trim();
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
