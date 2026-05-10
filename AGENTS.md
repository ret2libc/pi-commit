# Repo guidance

- Whenever you need to create a git commit for this repo, use `/commit` rather than invoking `git commit` directly.
- Before changing extension behavior, add or update a test like `test-extension.ts` or a future test file, verify it fails, implement the change, and verify it passes.
- When a repo invariant is violated, treat it as a defect, not a formatting issue. Add a failing test and fix the implementation instead of silently truncating or rewriting the model output.
- Always confirm the extension still works end-to-end before finishing.

## Working rules

1. **Think before coding**
   - State assumptions explicitly.
   - If something is unclear, ask rather than guess.
   - When there are multiple plausible interpretations, call them out.
   - Stop when confused and name what is unclear.

2. **Simplicity first**
   - Use the smallest change that solves the request.
   - Do not add speculative features or abstractions.
   - Ask whether a senior engineer would call the solution overcomplicated; if yes, simplify.

3. **Surgical changes**
   - Touch only what you must.
   - Clean up only your own mess.
   - Do not refactor unrelated code, comments, or formatting.
   - Match the codebase’s existing style.

4. **Goal-driven execution**
   - Define success criteria before you start.
   - Iterate until those criteria are verified.
   - Do not follow a script mechanically if the goal needs adjustment.

5. **Use the model only for judgment calls**
   - Use the model for classification, drafting, summarization, and extraction.
   - Do not use it for deterministic routing, retries, or transforms when code can do the job.
   - If code can answer, code answers.

6. **Watch token budgets**
   - Treat budgets as real constraints, not suggestions.
   - If a task looks like it may approach the budget, summarize and restart cleanly.
   - Surface the risk instead of silently overrunning.

7. **Surface conflicts, don’t average them**
   - If two patterns contradict, pick one based on recency or test coverage.
   - Explain the choice.
   - Flag the other pattern for cleanup instead of blending the two.

8. **Read before you write**
   - Before adding code, inspect exports, immediate callers, and shared utilities.
   - “Looks orthogonal” is not enough reason to skip context.
   - If you are unsure why code is structured a certain way, ask.

9. **Tests verify intent**
   - Tests should capture why behavior matters, not just what it does.
   - A test that cannot fail when the business logic changes is too weak.

10. **Checkpoint after significant steps**
    - Summarize what changed, what was verified, and what remains.
    - Do not continue from a state you cannot describe clearly.
    - If you lose track, stop and restate the plan.

11. **Match the codebase’s conventions**
    - Prefer conformance over personal taste.
    - If you think a convention is harmful, surface it explicitly instead of diverging silently.

12. **Fail loud**
    - Do not say “completed” if something was skipped silently.
    - Do not say “tests pass” if any relevant checks were skipped.
    - Default to surfacing uncertainty rather than hiding it.
