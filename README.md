# dockerdoctor

Interactive CLI that diagnoses and fixes Docker problems automatically. Lint your Dockerfile, compose file, and running containers — get actionable fixes, not just warnings.

## Features

- **48 checks** across 11 categories (23 static + 25 runtime)
- **Auto-fix** — safe fixes applied with `--fix` or via interactive prompts
- **No Docker required** for static checks (Dockerfile, compose, secrets, line endings, .dockerignore)
- **Runtime diagnostics** — build failures, startup crashes, networking, performance, image bloat, disk cleanup
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
# Run all checks in the current directory
dockerdoctor

# Lint just the Dockerfile
dockerdoctor dockerfile

# JSON output for CI
dockerdoctor --json

# Auto-apply all safe fixes
dockerdoctor --fix

# Check a specific file
dockerdoctor dockerfile -f path/to/Dockerfile
```

## Commands

| Command | Description |
|---------|-------------|
| `check` | Run all checks (default) |
| `dockerfile` | Lint Dockerfile only (9 checks) |
| `compose` | Lint compose file only (5 checks) |
| `secrets` | Scan for hardcoded secrets (4 checks) |
| `lineendings` | Check for CRLF issues (3 checks) |
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

| Category | Checks | Examples |
|----------|--------|----------|
| **Dockerfile** | 9 | Missing multi-stage builds, `latest` tag, running as root, shell form, layer ordering |
| **Compose** | 5 | Static IPs, missing healthchecks, bind mounts, bridge network mode |
| **Secrets** | 4 | Hardcoded passwords in ENV/ARG, secrets in compose env, sensitive file copies |
| **Line Endings** | 3 | CRLF detection, missing .gitattributes, missing dos2unix |
| **Dockerignore** | 2 | Missing .dockerignore, missing common entries |

### Runtime Checks (requires Docker)

| Category | Checks | Examples |
|----------|--------|----------|
| **Build** | 4 | Large build context, DNS resolution, disk space, platform mismatch |
| **Startup** | 4 | Exit code analysis, OOM killed, missing env vars, entrypoint issues |
| **Network** | 4 | Containers not on same network, DNS, port conflicts, localhost binding |
| **Performance** | 4 | High resource usage, bind mount I/O, build cache, resource limits |
| **Image** | 4 | Oversized images, layer analysis, architecture mismatch, base image bloat |
| **Cleanup** | 5 | Disk usage, dangling images, stopped containers, unused volumes, build cache |

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

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | No errors found |
| `1` | Errors found |
| `2` | Invalid arguments (bad file path, invalid severity) |

## License

[MIT](LICENSE)
