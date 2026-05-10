# Repo map

- `src/index.ts` — Pi extension entrypoint.
- `src/commands/commit.ts` — runtime wiring for the `/commit` command.
- `src/commit.ts` — injectable command factory plus public helpers.
- `src/core/` — pure helper modules for git, prompt building, sanitization, and model selection.
- `prompts/commit-message.md` — commit-message prompt template.
- `tests/` — helper tests, extension-flow tests, and fixtures.
- `test-extension.ts` — top-level test entrypoint used by `npm test`.
- `AGENTS.md` — repo-wide agent guidance.
