# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # Build with tsup (two targets: CLI + library)
npm run dev            # Build in watch mode
npm test               # Run all tests (vitest)
npx vitest run test/unit/checks/dockerfile.test.ts   # Run a single test file
npx vitest -t "layer-order"                          # Run tests matching a name
npm run lint           # Type-check only (tsc --noEmit)
node dist/bin/cli.js   # Run the CLI locally after building
node dist/bin/cli.js --json -f path/to/Dockerfile    # Test against a specific file
```

## Architecture

dockerdoctor is a Docker diagnostic CLI. It follows a **Check → Result → Fix** pipeline where checks examine files or Docker state, produce results with severity levels, and optionally offer fixes (auto or manual).

### Core Pipeline

```
buildContext(cwd) → CheckContext
    ↓
runChecks(context, opts) → iterates registered Check[]
    ↓
Check.run(context) → CheckResult[] (each with Fix[])
    ↓
Report { results, summary }
```

### Check Registration (Plugin Pattern)

Checks self-register via side-effect imports. The chain is:

1. `src/bin/cli.ts` imports `src/checks/index.ts`
2. That barrel imports each category's `index.ts` (e.g., `src/checks/dockerfile/index.ts`)
3. Each category barrel imports individual check files
4. Each check file calls `registerCheck()` at module scope

To add a new check: create the file, call `registerCheck()` in it, import it from the category barrel. No other wiring needed.

### Key Modules

- **`src/checks/registry.ts`** — Global singleton array. `registerCheck()` validates ID uniqueness. Query with `getAllChecks()`, `getChecksByCategory()`, `getStaticChecks()`, `getRuntimeChecks()`.
- **`src/context.ts`** — `buildContext()` auto-detects Dockerfile/compose/dockerignore/.gitattributes/.sh files in CWD, probes Docker daemon via `docker info`, parses found files.
- **`src/runner.ts`** — `runChecks()` orchestrates execution: filters by category, skips Docker-requiring checks if unavailable, catches check errors (converts to info-level results), applies severity threshold, builds Report.
- **`src/commands/check.ts`** — Main command handler. All subcommands (dockerfile, compose, secrets, etc.) delegate here with a category filter.

### docker-file-parser Behavior

The `docker-file-parser` library returns structured args, not raw strings:
- COPY/ADD → JSON arrays: `[".", "."]`
- ENV KEY=val → JSON objects: `{"NODE_ENV":"production"}`

These get JSON-stringified into the `args` field of `DockerfileInstruction`. Check implementations use regex patterns that handle both formats. Tests that construct `ParsedDockerfile` manually must account for this (some tests use plain string args to exercise check logic directly).

### Two Build Targets (tsup)

1. **CLI** (`src/bin/cli.ts` → `dist/bin/cli.js`): Gets `#!/usr/bin/env node` shebang banner, no `.d.ts`
2. **Library** (`src/index.ts` → `dist/index.js`): Generates `.d.ts` declarations, no shebang

### Fix Types

- **`auto`**: Has an `apply()` async function. Interactive mode prompts before calling. `--fix` flag applies all without prompting.
- **`manual`**: Has `instructions` string shown to user. No programmatic application.

### Exit Codes

- `0`: No errors found
- `1`: Errors found (warnings/info alone don't trigger)

### Docker Client Layer

- **`src/docker/client.ts`** — dockerode wrapper: getClient, resetClient, ping, listContainers, listImages, listVolumes, listNetworks, inspectContainer, getContainerLogs, getDiskUsage
- **`src/docker/exec.ts`** — execa wrapper for Docker CLI: dockerExec, dockerBuildContextSize, dockerSystemDf, dockerStats, dockerInspect, dockerLogs, dockerImageHistory, dockerNetworkInspect, dockerPortCheck

### Runtime Checks (25 checks, require Docker)

All 25 runtime checks are implemented across 6 categories: build (4), startup (4), network (4), performance (4), image (4), cleanup (5). They use `src/docker/client.ts` and `src/docker/exec.ts` to interact with Docker. Tests mock these docker modules to avoid requiring a running Docker daemon.

## Test Patterns

Tests use a `makeContext()` helper to build mock `CheckContext` objects:
```typescript
function makeContext(overrides: Partial<CheckContext> = {}): CheckContext {
  return { cwd: '/test', dockerAvailable: false, files: { shellScripts: [] }, ...overrides };
}
```

Each check test: imports the category barrel (triggers registration), gets checks via `getChecksByCategory()`, finds the specific check by ID, creates inline file content, parses it, and asserts on `check.run(context)` results. Both positive (issue found) and negative (clean input) cases are covered.

Integration tests in `test/integration/cli.test.ts` shell out to the built CLI and verify JSON output schema, exit codes, and category filtering.
