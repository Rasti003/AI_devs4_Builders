# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Devs 4 — kurs budowania agentów AI. Repozytorium zawiera 5 lekcji progressywnie zwiększających złożoność, od prostego LLM przez pełne agenty z narzędziami po architekturę MCP. Towarzyszący dashboard (React + xterm.js) pozwala uruchamiać lekcje z terminala przez przeglądarkę.

## Running Lessons

Each lesson is a separate npm project. Install dependencies and run from the lesson directory:

```bash
# s01e02 — Findhim agent (ES modules)
cd s01e02 && npm install
npm run agent:run      # main agent
npm run step1          # individual steps (step1–step4)
npm run openrouter:test

# s01e03 — MCP server
cd s01e03 && npm install
npm run dev            # ts-node (no rebuild needed)
npm start              # compiled version

# s01e04 — SPK agent
cd s01e04 && npm install
npm run dev            # ts-node
npm run download:spk   # download docs first

# s01e05 — Railway agent
cd s01e05 && npm install
npm run dev            # ts-node
npm start              # compiled

# s01e01 — Python
cd s01e01
python openrouter_structured_people.py
```

All TypeScript lessons build with `npm run build` (tsc). No test framework is used.

## Dashboard

Terminal UI for running lessons:

```bash
cd dashboard && npm install
npm run dev     # dev mode: server :3847 + Vite :5174 (proxied)
npm run build   # production build
npm start       # production server :3847
```

Lessons available in dashboard are configured in `dashboard/lessons.json`.

## Architecture

### Module systems — mixed, be careful
- `s01e02` and `dashboard/client`: **ES modules** (`"type": "module"`, `NodeNext` resolution) — imports require `.js` extensions
- `s01e03`, `s01e04`, `s01e05`, `dashboard/server`: **CommonJS** — standard `require`/`module.exports`

### Agent pattern (ReAct)
All TypeScript agents follow the same loop structure:
1. System prompt defines tools and constraints
2. Agent calls LLM (OpenRouter), gets JSON with tool name + args
3. Agent executes the tool, appends result to message history
4. Loop repeats until `FINAL_ANSWER` or `MAX_ITERATIONS` reached

Key files to understand the pattern: `s01e02/src/findhim_agent.ts`, `s01e05/src/index.ts`.

### OpenRouter integration
Each lesson has its own LLM client (`openrouter_client.ts` or `llm_client.ts`) calling OpenRouter's chat completions endpoint. No shared client across lessons.

### MCP (s01e03 only)
`s01e03` implements Model Context Protocol — the agent (`src/mcp/agent.ts`) communicates with tools via the `@modelcontextprotocol/sdk`. Other lessons use plain function calls, not MCP.

### Dashboard data flow
`dashboard/server/index.ts` → spawns lesson processes via `runLesson.ts` → streams stdout/stderr over WebSocket → `dashboard/client` renders in xterm.js terminal.

## Environment

Root `.env` (gitignored, never commit):
```
AIDEVS_KEY=...
OPENROUTER_API_KEY=...
```

Each lesson loads from root `.env` via `dotenv`. The dashboard's `.env` is optional (PORT, ROOT_DIR overrides).

## Lesson Content Context

- `s01e04/index.md` — 785-line SPK (postal/railway system) specification the agent must navigate
- `s01e04/AGENT_KLUCZOWE.md` — 10 key principles of AI agent architecture (notes from lesson)
- Answers/flags are submitted to the AI Devs platform via HTTP endpoints
