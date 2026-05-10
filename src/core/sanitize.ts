import { TITLE_MAX_LENGTH } from "./prompt.ts";


export function sanitizeCommitMessage(commitMsg: string): string {
  let cleaned = stripUnsafeCharacters(commitMsg).trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-z0-9_-]*\s*\n/i, "").replace(/\n```$/i, "").trim();
  }

  return limitCommitTitleLength(cleaned, TITLE_MAX_LENGTH);
}

export function limitCommitTitleLength(commitMsg: string, maxTitleLength: number = TITLE_MAX_LENGTH): string {
  const trimmed = commitMsg.trim();
  if (!trimmed) {
    return trimmed;
  }

  const firstLineBreak = trimmed.indexOf("\n");
  const title = firstLineBreak === -1 ? trimmed : trimmed.slice(0, firstLineBreak);
  const rest = firstLineBreak === -1 ? "" : trimmed.slice(firstLineBreak);

  if (title.length <= maxTitleLength) {
    return trimmed;
  }

  const truncatedTitle = title.slice(0, maxTitleLength).trimEnd();
  return `${truncatedTitle}${rest}`;
}

export function stripUnsafeCharacters(text: string): string {
  return text
    .replace(/\0/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n?/g, "\n");
}
