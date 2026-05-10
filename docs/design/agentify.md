## Biggest wins

### 1) Split the extension into small modules

Right now almost everything lives in `src/index.ts`, which is hard for both humans and agents to reason about.

I’d break it into:

- `src/commands/commit.ts`
- `src/core/git.ts`
- `src/core/model-selection.ts`
- `src/core/prompt.ts`
- `src/core/sanitize.ts`
- `src/core/config.ts`

That gives agents:

- smaller files to read
- clearer responsibilities
- easier test targets
- less risk of accidentally changing unrelated behavior

---

### 2) Extract pure functions first

For agent-friendliness, the most valuable thing is **testable pure logic**.

I’d pull out:

- `selectCommitModel(models, ctxModel, flags, config)`
- `buildCommitPrompt(lastCommits, diff, styleHints)`
- `sanitizeCommitMessage(raw)`
- `shouldStageTrackedChanges(stagedDiff, unstagedDiff)`

Then add unit tests for those.

That way an agent can:

- change prompt logic without touching git code
- change model selection without running a real session
- validate commit message cleanup independently

---

### 4) Use a structured output contract internally

Instead of asking the model for “just a commit message” in freeform text, have it return a small schema like:

```json
{
  "title": "...",
  "body": "...",
  "type": "feat",
  "confidence": 0.82
}
```

Then your code can:

- validate title length
- trim/sanitize safely
- optionally reject low-quality outputs
- format the final commit message consistently

This makes the system much easier for agents to debug and extend.

---

## Repo-level improvements for agents

### 6) Add a real test harness with fixtures

`test-extension.ts` is a good start, but it’s still pretty ad hoc.

I’d add:

- `tests/fixtures/simple-change/`
- `tests/fixtures/no-staged-changes/`
- `tests/fixtures/commit-style-repo/`

And tests like:

- model selection
- prompt building
- commit message sanitization
- staging behavior
- “no changes” behavior
- non-git repo behavior

That gives agents a deterministic place to work.

---

### 7) Put agent instructions closer to code

A root `AGENTS.md` is good, but you can go further:

- `src/AGENTS.md` — coding rules for implementation
- `tests/AGENTS.md` — how to write and run tests
- `docs/AGENTS.md` — how to update docs

This helps agents operating in specific subtrees make better decisions without re-reading the whole repo.

---

### 8) Add a “repo map” for agents

A short file like `docs/repo-map.md` would help a lot:

- what each file does
- what is safe to edit
- where tests live
- where prompts/config live
- common commands to run

This is one of the highest ROI additions for AI-assisted work.

---

### 9) Make dry-run the default for new commands

Agents are much safer if they can inspect before mutating.

I’d add:

- `--dry-run`
- `--no-commit`
- `--no-stage`
- `--explain`

That way an agent can first plan, then apply.

---

### 10) Keep prompt templates in files, not inline

The current prompt is hardcoded in `src/index.ts`.

I’d move it to something like:

- `prompts/commit-message.md`
- `prompts/commit-style-analysis.md`

That makes it easier for agents to:

- inspect prompt changes
- diff prompt revisions
- test prompt-specific behavior
