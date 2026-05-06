# pi-commit

A Pi extension that adds a `/commit` command to generate and execute git commits with AI-generated messages.

## Features

- **Automated Message Generation**: Analyzes your staged (or unstaged) changes and recent commit history to suggest a meaningful commit message.
- **Git Best Practices**: Ensures the commit title (first line) is at most 72 characters long.
- **Project Style Awareness**: Uses the last 5 commit messages to match the existing project's commit style.
- **Smart Model Selection**: Automatically tries to use a "cheap" model (like `gpt-4o-mini`, `claude-3-haiku`, or `gemini-flash`) for the generation task to save on costs.
- **Interactive Workflow**: Previews the generated message and asks for confirmation before committing.
- **Smart Staging**: If no files are staged, it offers to stage tracked changes for you.

## Installation

1. Clone this repository into your Pi extensions directory:
   ```bash
   git clone https://github.com/ret2libc/pi-commit.git ~/.pi/agent/extensions/pi-commit
   ```
2. Install dependencies:
   ```bash
   cd ~/.pi/agent/extensions/pi-commit
   npm install
   ```
3. Restart Pi or use `/reload`.

Alternatively, you can install it as a Pi package (if published):
```bash
pi install git:github.com/ret2libc/pi-commit
```

## Usage

In any Pi session within a git repository:

```
/commit
```

You can also specify a model ID to override the default selection:
```
/commit gpt-4o-mini
```

## Configuration

The extension uses your existing Pi model configuration. It will prioritize models in this order:
1. Model ID passed as an argument to `/commit`.
2. Model ID specified via the `--commit-model` CLI flag.
3. Model ID specified in `~/.pi/agent/pi-commit.json` (see below).
4. Automatically detected "cheap" models (prioritizing `gpt-5-mini`, then any containing `mini`, `haiku`, `flash`, or `llama-3-8b`).
5. The currently active model in the session.

### Permanent Configuration
To set a permanent default model for this extension, create a file at `~/.pi/agent/pi-commit.json`:
```json
{
  "model": "gpt-5-mini"
}
```

## License

MIT
