# dockerdoctor

<p align="center">
  <a href="https://thedecipherist.github.io/dockerdoctor/">📖 Documentation & Guide</a> •
  <a href="https://www.npmjs.com/package/dockerdoctor">📦 npm Package</a>
</p>

[![npm version](https://img.shields.io/npm/v/dockerdoctor)](https://www.npmjs.com/package/dockerdoctor)
[![license](https://img.shields.io/npm/l/dockerdoctor)](LICENSE)

Interactive CLI that diagnoses and fixes Docker problems automatically. Lint your Dockerfile, compose file, and running containers — get actionable fixes, not just warnings.

## Features

- **50 checks** across 11 categories (25 static + 25 runtime)
- **Interactive mode** — guided scan wizard with directory discovery and check selection
- **TUI browser** — split-pane terminal UI to browse results, view details, and copy fix code
- **Auto-fix** — safe fixes applied with `--fix` or via interactive prompts
- **Smart compose detection** — auto-discovers compose files by standard names or content sniffing
- **No Docker required** for static checks (Dockerfile, compose, secrets, line endings, .dockerignore)
- **Runtime diagnostics** — build failures, startup crashes, networking, performance, image bloat, disk cleanup
- **Clipboard copy** — press `c` in the TUI to copy dedented, paste-ready code blocks
- **CI-friendly** — JSON output, deterministic exit codes, zero interactive prompts
- **Programmatic API** — import and run checks from your own scripts

## Installation

```bash
npm install -g dockerdoctor
```

Or use without installing:

```bash
npx dockerdoctor
```

## Quick Start

```bash
# Launch interactive mode (default)
dockerdoctor

# Lint just the Dockerfile
dockerdoctor dockerfile

# JSON output for CI
dockerdoctor --json

# Auto-apply all safe fixes
dockerdoctor --fix

# Check a specific file
dockerdoctor dockerfile -f path/to/Dockerfile

# Check a specific compose file
dockerdoctor compose -c docker-compose.prod.yml

# Only show errors (skip warnings and info)
dockerdoctor --severity error
```

## Interactive Mode

Running `dockerdoctor` with no flags launches interactive mode:

1. **Choose scan target** — current directory, scan subdirectories, enter a custom path, or Docker daemon only
2. **Pick check categories** — all checks, or select specific categories (Dockerfile, Compose, Secrets, etc.)
3. **Browse results** — TUI with split-pane view, YAML highlighting, and one-key clipboard copy

Subdirectory scanning walks up to 4 levels deep, skipping `node_modules`, `.git`, `dist`, and other build directories.

## TUI Browser

When results are found, the TUI shows:

- **Left pane** — results grouped by severity (Errors, Warnings, Info)
- **Right pane** — full detail: description, location, fix instructions with YAML syntax highlighting

| Key | Action |
|-----|--------|
| `↑` / `↓` or `j` / `k` | Navigate results |
| `Enter` or `→` | Open category |
| `←` or `q` | Go back |
| `Shift+↑` / `Shift+↓` | Scroll detail pane |
| `c` | Copy fix code to clipboard |
| `Ctrl+C` | Exit |

The `c` key extracts only code blocks from fix instructions — properly dedented and ready to paste into your Dockerfile or compose file.

## Commands

| Command | Description |
|---------|-------------|
| *(none)* | Launch interactive mode |
| `check` | Run all checks (default with `--json`/`--ci`/`--fix`) |
| `dockerfile` | Lint Dockerfile only (9 checks) |
| `compose` | Lint compose file only (7 checks) |
| `secrets` | Scan for hardcoded secrets (4 checks) |
| `lineendings` | Check for CRLF issues (3 checks) |
| `dockerignore` | Check .dockerignore (2 checks) |
| `build` | Diagnose build failures (4 checks, needs Docker) |
| `startup` | Diagnose startup failures (4 checks, needs Docker) |
| `network` | Diagnose networking issues (4 checks, needs Docker) |
| `perf` | Diagnose performance issues (4 checks, needs Docker) |
| `image` | Analyze image for bloat (4 checks, needs Docker) |
| `cleanup` | Find reclaimable disk space (5 checks, needs Docker) |

## Flags

| Flag | Description |
|------|-------------|
| `--json` | Output results as JSON |
| `--ci` | CI mode (JSON output + exit codes) |
| `--fix` | Auto-apply all safe fixes |
| `--severity <level>` | Minimum severity: `error`, `warning`, or `info` |
| `-f, --file <path>` | Path to Dockerfile |
| `-c, --composefile <path>` | Path to compose file |
| `-V, --version` | Print version |
| `-h, --help` | Print help |

## Check Categories

### Static Checks (no Docker required)

| Category | Checks | What it catches |
|----------|--------|-----------------|
| **Dockerfile** | 9 | Missing multi-stage builds, `latest` tag, running as root, shell form CMD, layer ordering, npm install vs ci, missing CHOWN, Alpine cache cleanup |
| **Compose** | 7 | Missing healthchecks, undefined networks, network mismatch between services, static IPs, bind mounts, bridge network mode, Swarm config ignored |
| **Secrets** | 4 | Hardcoded passwords in ENV/ARG, secrets in compose environment, sensitive file COPY |
| **Line Endings** | 3 | CRLF detection, missing .gitattributes, missing dos2unix in Dockerfile |
| **Dockerignore** | 2 | Missing .dockerignore, missing common entries (node_modules, .git, etc.) |

### Runtime Checks (requires Docker)

| Category | Checks | What it catches |
|----------|--------|-----------------|
| **Build** | 4 | Large build context, DNS resolution failures, insufficient disk space, platform mismatch |
| **Startup** | 4 | Exit code analysis, OOM killed containers, missing env vars, entrypoint not found |
| **Network** | 4 | Containers not on same network, DNS resolution, port conflicts, localhost binding |
| **Performance** | 4 | High CPU/memory usage, bind mount I/O, unused build cache, suboptimal resource limits |
| **Image** | 4 | Oversized images, inefficient layers, architecture mismatch, base image bloat |
| **Cleanup** | 5 | Disk usage, dangling images, stopped containers, unused volumes, build cache waste |

## Compose File Discovery

dockerdoctor automatically finds compose files using a two-pass strategy:

1. **Standard names** — checks for `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, `compose.yaml`
2. **Content sniffing** — if no standard file is found, scans `.yml`/`.yaml` files for a `services:` key (skipping CI configs, Kubernetes manifests, and build tool files)

This means non-standard filenames like `infra.yml` are detected automatically if they contain compose content.

## CI/CD Integration

```yaml
# GitHub Actions
- name: Lint Dockerfiles
  run: npx dockerdoctor --ci --severity error
```

The `--ci` flag outputs JSON and uses exit codes:
- **Exit 0** — no errors found
- **Exit 1** — errors found (warnings and info alone don't trigger failure)

## Programmatic API

```typescript
import { buildContext, runChecks } from 'dockerdoctor';

const context = await buildContext(process.cwd());
const report = await runChecks(context, {
  categories: ['dockerfile', 'secrets'],
  minSeverity: 'warning',
});

console.log(`Found ${report.summary.errors} errors`);
for (const result of report.results) {
  console.log(`[${result.severity}] ${result.title}: ${result.message}`);
}
```

Exported functions:

| Export | Description |
|--------|-------------|
| `buildContext(cwd)` | Auto-detect and parse Docker files in a directory |
| `runChecks(context, opts)` | Execute checks and return a `Report` |
| `registerCheck(check)` | Register a custom check |
| `getAllChecks()` | Get all registered checks |
| `getChecksByCategory(cat)` | Get checks for a specific category |
| `parseDockerfile(raw, path)` | Parse a Dockerfile string |
| `parseCompose(raw, path)` | Parse a compose file string |
| `parseDockerignore(raw, path)` | Parse a .dockerignore string |
| `findComposeFile(dir)` | Find a compose file in a directory |
| `findAllComposeFiles(dir)` | Find all compose files in a directory |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | No errors found |
| `1` | Errors found |
| `2` | Invalid arguments (bad file path, invalid severity) |

## License

[MIT](LICENSE)
