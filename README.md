# pi-commit

A Pi extension that adds a `/commit` command to generate and execute git commits with AI-generated messages.

## Features

- **Automated Message Generation**: Analyzes your staged (or unstaged) changes and recent commit history to suggest a meaningful commit message.
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

The extension will:
1. Check for changes (staged or unstaged).
2. Gather recent commit history.
3. Generate a commit message using a suitable AI model.
4. Show you the message and ask for confirmation.
5. Execute `git commit`.

## Configuration

The extension uses your existing Pi model configuration. It will prioritize models with names containing "mini", "haiku", or "flash" if available.

## License

MIT
