export function selectCommitDiff(
  stagedDiff: string,
  unstagedDiff: string,
  untrackedDiff: string = "",
): {
  diff: string;
  isStaged: boolean;
  includesUntracked: boolean;
} {
  if (stagedDiff && stagedDiff.trim() !== "") {
    return { diff: stagedDiff, isStaged: true, includesUntracked: false };
  }

  const parts = [unstagedDiff, untrackedDiff].filter((part) => part.trim() !== "");
  return {
    diff: parts.join("\n"),
    isStaged: false,
    includesUntracked: untrackedDiff.trim() !== "",
  };
}
