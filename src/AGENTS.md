# src/

- Keep the command entrypoint thin; put pure logic in small modules under `src/core/`.
- Prefer dependency injection for anything that talks to git, the filesystem, or Pi runtime services.
- If you change the commit flow, prompt text, or model-selection logic, update the tests in `tests/` or `test-extension.ts`.
