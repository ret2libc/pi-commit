import { spawn } from "node:child_process";

export type GitResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export async function runGit(
  args: string[],
  options: { cwd?: string; encoding?: BufferEncoding } = {},
): Promise<GitResult> {
  return new Promise<GitResult>((resolve) => {
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

export async function getGitSnapshot(cwd: string, runGitImpl: typeof runGit = runGit) {
  const [gitStatus, lastCommitsResult, stagedDiffResult, unstagedDiffResult, untrackedDiffResult] = await Promise.all([
    runGitImpl(["rev-parse", "--is-inside-work-tree"], { cwd, encoding: "utf-8" }),
    runGitImpl(["log", "-n", "5", "--no-merges", "--invert-grep", "--grep=dependabot", "--format=%B%n---"], {
      cwd,
      encoding: "utf-8",
    }),
    runGitImpl(["diff", "--staged"], { cwd, encoding: "utf-8" }),
    runGitImpl(["diff"], { cwd, encoding: "utf-8" }),
    getUntrackedDiff(cwd, runGitImpl),
  ]);

  return {
    gitStatus,
    lastCommits: lastCommitsResult.stdout,
    stagedDiff: stagedDiffResult.stdout,
    unstagedDiff: unstagedDiffResult.stdout,
    untrackedDiff: untrackedDiffResult,
  };
}

async function getUntrackedDiff(cwd: string, runGitImpl: typeof runGit): Promise<string> {
  const listResult = await runGitImpl(["ls-files", "-z", "--others", "--exclude-standard"], { cwd, encoding: "utf-8" });
  if (listResult.status !== 0) {
    return "";
  }

  const untrackedFiles = listResult.stdout
    .split("\0")
    .filter((file) => file.length > 0);

  if (untrackedFiles.length === 0) {
    return "";
  }

  const diffs = await Promise.all(
    untrackedFiles.map((file) =>
      runGitImpl(["diff", "--no-index", "--", "/dev/null", file], { cwd, encoding: "utf-8" }),
    ),
  );

  return diffs
    .map((result) => result.stdout)
    .filter((diff) => diff.trim() !== "")
    .join("\n");
}
