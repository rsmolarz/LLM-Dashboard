# VPS CLI Tools Guide

Two AI coding agents are deployed on your VPS (`72.60.167.64`) as global commands. Both are terminal-based AI assistants that can read, write, and edit code, run shell commands, and manage projects — all from the command line.

---

## Table of Contents

1. [Overview](#overview)
2. [Connecting to the VPS](#connecting-to-the-vps)
3. [Claude Code](#claude-code)
4. [Claw Code Agent](#claw-code-agent)
5. [Quick Reference](#quick-reference)
6. [Configuration](#configuration)
7. [Tips and Workflows](#tips-and-workflows)
8. [Troubleshooting](#troubleshooting)

---

## Overview

| Tool | Language | Location on VPS | Command |
|------|----------|----------------|---------|
| Claude Code | TypeScript/Bun | `/root/claude-code` | `claude-code` |
| Claw Code Agent | Python | `/root/claw-code-agent` | `claw-code-agent` |

**Claude Code** is the leaked source of Anthropic's official AI coding CLI, rebuilt from npm sourcemaps. It's a full-featured agent with 40+ tools, multi-agent orchestration, and a React-based terminal UI (Ink).

**Claw Code Agent** is a Python reimplementation of the Claude Code architecture designed to work with local open-source models (via Ollama, vLLM, LiteLLM, or OpenRouter). Zero external dependencies — pure Python standard library.

---

## Connecting to the VPS

### From LLM Hub Workbench

1. Open the **Workbench** or **Claude Workbench** page
2. Click the **SSH** tab in any panel
3. Enter your VPS credentials and click **Connect**
4. Switch to **Terminal** mode
5. Type `claude-code --help` or `claw-code-agent --help`

### From Your Own Terminal

```bash
ssh root@72.60.167.64
```

Once connected, both commands are available globally.

---

## Claude Code

### Basic Usage

```bash
# Show all available commands
claude-code --help

# Start an interactive chat session
claude-code chat

# Ask a one-off question
claude-code ask "How do I set up a systemd service?"

# Edit code with AI assistance
claude-code edit

# Run a command with AI guidance
claude-code run

# Fix issues in code
claude-code fix

# Write tests
claude-code test

# Create a commit message
claude-code commit

# Create a pull request
claude-code pr

# Review code
claude-code review

# Generate documentation
claude-code docs

# Run as an autonomous agent
claude-code agent

# Open a shell with AI assistance
claude-code shell

# GitHub integration
claude-code gh
```

### Account Management

```bash
# Log in to your account
claude-code login

# Log out
claude-code logout

# View/change settings
claude-code settings
```

### MCP (Model Context Protocol)

```bash
# Manage MCP connections
claude-code mcp
```

### Key Features

- **40+ built-in tools**: File read/write, bash execution, web search, LSP integration, git operations
- **Multi-agent orchestration**: Can delegate tasks to sub-agents
- **Session persistence**: Conversations are saved and can be resumed
- **Context engine**: Automatically discovers and loads project context
- **Buddy system**: A virtual Tamagotchi companion (cosmetic feature)
- **Dream system**: Background memory consolidation

### Project Directory

```
/root/claude-code/
├── dist/
│   ├── main.js          # Built CLI entry point
│   ├── preload.js       # Preload script
│   └── assets/          # Static assets
├── src/                 # Source code
├── node_modules/        # Dependencies
├── package.json
└── run-claude-code.sh   # Wrapper script
```

---

## Claw Code Agent

### Basic Usage

```bash
# Show all available commands
claw-code-agent --help

# Show help for specific commands
claw-code-agent agent --help
claw-code-agent agent-chat --help
```

### One-Shot Agent Mode

Ask the AI to do something and it will use tools (file read/write, shell, search) to complete the task:

```bash
# Read and summarize a file
claw-code-agent agent "Read /root/my-project/main.py and explain what it does" --cwd /root/my-project

# Fix a bug
claw-code-agent agent "Find and fix the bug in server.py" --cwd /root/my-project

# Write new code
claw-code-agent agent "Create a Flask REST API with CRUD endpoints for a todo app" --cwd /root/my-project

# Review code
claw-code-agent agent "Review all Python files and suggest improvements" --cwd /root/my-project
```

### Interactive Chat Mode

Multi-turn conversation with session continuity:

```bash
# Start an interactive chat
claw-code-agent agent-chat --cwd /root/my-project

# With streaming output (token by token)
claw-code-agent agent-chat --stream --cwd /root/my-project
```

Inside the chat, type your questions or instructions. Use `/exit` to quit.

### Slash Commands (Inside Chat)

| Command | Description |
|---------|-------------|
| `/help` | Show available slash commands |
| `/context` | Show current context usage |
| `/context-raw` | Show raw context details |
| `/prompt` | Show the assembled system prompt |
| `/permissions` | Show current permission level |
| `/model` | Show or change the active model |
| `/tools` | List available tools |
| `/memory` | Show loaded memory files |
| `/status` | Show agent status and stats |
| `/clear` | Clear conversation history |
| `/exit` | Exit the chat |

### Session Management

```bash
# Resume a previous session
claw-code-agent agent-resume --session-id <id>

# Run agent in background
claw-code-agent agent-bg "Run tests and fix failures" --cwd /root/my-project

# List background sessions
claw-code-agent agent-ps

# View background session logs
claw-code-agent agent-logs <session-id>

# Attach to a background session
claw-code-agent agent-attach <session-id>

# Kill a background session
claw-code-agent agent-kill <session-id>
```

### Daemon Mode

```bash
claw-code-agent daemon start
claw-code-agent daemon ps
claw-code-agent daemon logs
claw-code-agent daemon attach
claw-code-agent daemon kill
```

### Permission Levels

Control what the agent can do:

```bash
# Read-only (safest) — can only read files
claw-code-agent agent "..." --cwd .

# Allow file writes
claw-code-agent agent "..." --allow-write --cwd .

# Allow shell command execution
claw-code-agent agent "..." --allow-shell --cwd .

# Allow everything (use with caution)
claw-code-agent agent "..." --unsafe --cwd .
```

### Structured Output

Get JSON responses for programmatic use:

```bash
claw-code-agent agent "List all Python files" --response-schema-file schema.json --cwd .
```

### Inspection Commands (No Model Required)

These commands work offline — they inspect the local codebase and configuration:

```bash
claw-code-agent summary
claw-code-agent manifest
claw-code-agent parity-audit
claw-code-agent setup-report
claw-code-agent command-graph
claw-code-agent tool-pool
claw-code-agent bootstrap-graph
claw-code-agent subsystems --limit 20
claw-code-agent commands --limit 10
claw-code-agent tools --limit 10
```

### Running Tests

```bash
# Full test suite
cd /root/claw-code-agent
python3 -m unittest discover -s tests -v

# Specific test module
python3 -m unittest tests.test_agent_runtime -v
```

### Key Features

- **Core tools**: File read/write/edit, glob search, grep search, bash execution
- **Plugin system**: Manifest-based plugins with hooks, aliases, virtual tools
- **Nested agent delegation**: Delegate subtasks to child agents
- **Streaming output**: Token-by-token streaming with `--stream`
- **Cost tracking**: Token budgets, cost limits, tool-call caps
- **Context compaction**: Auto-snip and auto-compact to manage context window
- **Session persistence**: Save and resume sessions with file-history replay
- **MCP support**: Model Context Protocol for external tool integration
- **Web search**: Provider-backed web search capability
- **Notebook editing**: Native Jupyter notebook cell editing
- **Git worktrees**: Managed git worktree sessions

### Project Directory

```
/root/claw-code-agent/
├── src/
│   ├── main.py              # CLI entry point
│   ├── agent_runtime.py     # Core agent loop
│   ├── agent_tools.py       # Tool definitions
│   ├── agent_prompting.py   # System prompt assembly
│   ├── agent_context.py     # Context building
│   ├── agent_session.py     # Session management
│   ├── openai_compat.py     # OpenAI-compatible API client
│   └── ...                  # Many more runtime modules
├── tests/                   # Unit tests
├── pyproject.toml
└── run-claw-code-agent.sh   # Wrapper script
```

---

## Quick Reference

### Claude Code — Common Commands

```bash
claude-code chat                    # Interactive chat
claude-code ask "question"          # One-off question
claude-code edit                    # AI-assisted editing
claude-code review                  # Code review
claude-code fix                     # Fix code issues
claude-code test                    # Write/run tests
claude-code commit                  # Generate commit message
claude-code agent                   # Autonomous agent mode
claude-code --help                  # Full help
```

### Claw Code Agent — Common Commands

```bash
claw-code-agent agent-chat --stream --cwd .       # Interactive chat
claw-code-agent agent "do something" --cwd .       # One-shot task
claw-code-agent agent "..." --allow-write --cwd .  # With write access
claw-code-agent agent "..." --unsafe --cwd .       # Full access
claw-code-agent agent-bg "task" --cwd .            # Background task
claw-code-agent agent-resume --session-id <id>     # Resume session
claw-code-agent --help                             # Full help
```

---

## Configuration

### Claw Code Agent — Model Backend

Claw Code Agent needs an OpenAI-compatible API backend. Set these environment variables on the VPS:

**Using Ollama (already installed on VPS):**

```bash
export OPENAI_BASE_URL=http://127.0.0.1:11434/v1
export OPENAI_API_KEY=ollama
export OPENAI_MODEL=qwen3
```

**Using vLLM:**

```bash
export OPENAI_BASE_URL=http://127.0.0.1:8000/v1
export OPENAI_API_KEY=local-token
export OPENAI_MODEL=Qwen/Qwen3-Coder-30B-A3B-Instruct
```

**Using OpenRouter (cloud):**

```bash
export OPENAI_BASE_URL=https://openrouter.ai/api/v1
export OPENAI_API_KEY=sk-or-v1-your-key-here
export OPENAI_MODEL=openai/gpt-4o-mini
```

**Using LiteLLM Proxy:**

```bash
export OPENAI_BASE_URL=http://127.0.0.1:4000
export OPENAI_API_KEY=anything
export OPENAI_MODEL=ollama/qwen3
```

To make these persistent, add them to `/root/.bashrc`:

```bash
echo 'export OPENAI_BASE_URL=http://127.0.0.1:11434/v1' >> ~/.bashrc
echo 'export OPENAI_API_KEY=ollama' >> ~/.bashrc
echo 'export OPENAI_MODEL=qwen3' >> ~/.bashrc
source ~/.bashrc
```

### Claude Code — Configuration

Claude Code uses its own settings system:

```bash
claude-code settings
```

---

## Tips and Workflows

### Code Review Workflow

```bash
# Navigate to a project
cd /root/my-project

# Use Claw Code Agent to review
claw-code-agent agent "Review all source files for bugs, security issues, and improvements" --cwd .

# Or use Claude Code
claude-code review
```

### Deploy a Project Workflow

```bash
# Use Claw Code Agent to set up a deployment
claw-code-agent agent "Set up this project as a systemd service that starts on boot" --allow-shell --cwd /root/my-app
```

### Fix Bugs Workflow

```bash
# Point the agent at the error
claw-code-agent agent "The server crashes with 'KeyError: user_id' on line 45 of server.py. Fix it." --allow-write --cwd /root/my-app

# Or with Claude Code
claude-code fix
```

### Write Tests Workflow

```bash
claw-code-agent agent "Write comprehensive unit tests for all modules" --allow-write --cwd /root/my-app
```

### Background Task

```bash
# Run a long task in background
claw-code-agent agent-bg "Refactor the entire codebase to use async/await" --allow-write --cwd /root/my-app

# Check progress
claw-code-agent agent-ps

# View output
claw-code-agent agent-logs <session-id>
```

---

## Troubleshooting

### "command not found"

The commands are symlinked to `/usr/local/bin/`. If missing:

```bash
# Claude Code
ln -sf /root/claude-code/run-claude-code.sh /usr/local/bin/claude-code

# Claw Code Agent
ln -sf /root/claw-code-agent/run-claw-code-agent.sh /usr/local/bin/claw-code-agent
```

### Claw Code Agent: "Connection refused" or model errors

Make sure your model backend (Ollama/vLLM) is running:

```bash
# Check if Ollama is running
curl http://127.0.0.1:11434/api/tags

# Start Ollama if needed
ollama serve &

# Pull a model if needed
ollama pull qwen3
```

### Claude Code: Bun not found

```bash
# Reinstall Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

### Permission denied

```bash
chmod +x /root/claude-code/run-claude-code.sh
chmod +x /root/claw-code-agent/run-claw-code-agent.sh
```

### Session or cache issues

```bash
# Claw Code Agent — clear session data
rm -rf /root/claw-code-agent/.claw-sessions/

# Claude Code — check settings
claude-code settings
```
