import { existsSync } from 'node:fs';
import { Command, Option } from 'commander';
import type { CliOptions, Severity } from '../types/index.js';
import { getVersion } from '../version.js';

// Register all checks via side-effect imports
import '../checks/index.js';

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

const program = new Command();

function parseOptions(cmd: Command): CliOptions {
  const opts = cmd.optsWithGlobals();

  // Validate file paths
  if (opts.file && !existsSync(opts.file)) {
    console.error(`Error: Dockerfile not found: ${opts.file}`);
    process.exit(2);
  }
  if (opts.composefile && !existsSync(opts.composefile)) {
    console.error(`Error: Compose file not found: ${opts.composefile}`);
    process.exit(2);
  }

  return {
    json: opts.json ?? false,
    ci: opts.ci ?? false,
    fix: opts.fix ?? false,
    severity: opts.severity as Severity | undefined,
    file: opts.file,
    composefile: opts.composefile,
  };
}

program
  .name('dockerdoctor')
  .description('Diagnose and fix Docker problems automatically')
  .version(getVersion())
  .option('--json', 'Output results as JSON')
  .option('--ci', 'CI mode (JSON output + exit codes)')
  .option('--fix', 'Auto-apply all safe fixes')
  .addOption(new Option('--severity <level>', 'Minimum severity level').choices(['error', 'warning', 'info']))
  .option('-f, --file <path>', 'Dockerfile path')
  .option('-c, --composefile <path>', 'Compose file path')
  .showSuggestionAfterError(true);

program
  .command('check')
  .description('Run all checks')
  .action(async () => {
    const { checkCommand } = await import('../commands/check.js');
    const code = await checkCommand(parseOptions(program));
    process.exit(code);
  });

program
  .command('dockerfile')
  .description('Lint Dockerfile only')
  .action(async () => {
    const { dockerfileCommand } = await import('../commands/dockerfile.js');
    const code = await dockerfileCommand(parseOptions(program));
    process.exit(code);
  });

program
  .command('compose')
  .description('Lint compose file only')
  .action(async () => {
    const { composeCommand } = await import('../commands/compose.js');
    const code = await composeCommand(parseOptions(program));
    process.exit(code);
  });

program
  .command('secrets')
  .description('Scan for hardcoded secrets')
  .action(async () => {
    const { secretsCommand } = await import('../commands/secrets.js');
    const code = await secretsCommand(parseOptions(program));
    process.exit(code);
  });

program
  .command('lineendings')
  .description('Check for CRLF issues')
  .action(async () => {
    const { lineendingsCommand } = await import('../commands/lineendings.js');
    const code = await lineendingsCommand(parseOptions(program));
    process.exit(code);
  });

program
  .command('build')
  .description('Diagnose build failures (needs Docker)')
  .action(async () => {
    const { buildCommand } = await import('../commands/build.js');
    const code = await buildCommand(parseOptions(program));
    process.exit(code);
  });

program
  .command('startup')
  .description('Diagnose startup failures (needs Docker)')
  .action(async () => {
    const { startupCommand } = await import('../commands/startup.js');
    const code = await startupCommand(parseOptions(program));
    process.exit(code);
  });

program
  .command('network')
  .description('Diagnose networking issues (needs Docker)')
  .action(async () => {
    const { networkCommand } = await import('../commands/network.js');
    const code = await networkCommand(parseOptions(program));
    process.exit(code);
  });

program
  .command('perf')
  .description('Diagnose performance issues (needs Docker)')
  .action(async () => {
    const { perfCommand } = await import('../commands/perf.js');
    const code = await perfCommand(parseOptions(program));
    process.exit(code);
  });

program
  .command('image [name]')
  .description('Analyze image for bloat (needs Docker)')
  .action(async () => {
    const { imageCommand } = await import('../commands/image.js');
    const code = await imageCommand(parseOptions(program));
    process.exit(code);
  });

program
  .command('cleanup')
  .description('Find reclaimable disk space (needs Docker)')
  .action(async () => {
    const { cleanupCommand } = await import('../commands/cleanup.js');
    const code = await cleanupCommand(parseOptions(program));
    process.exit(code);
  });

// When no subcommand is given, show interactive menu or run all checks
program.argument('[args...]', '', []);
program.action(async (args: string[]) => {
  if (args.length > 0) {
    console.error(`error: unknown command '${args[0]}'`);
    console.error(`Run 'dockerdoctor --help' for available commands.`);
    process.exit(1);
  }
  const opts = parseOptions(program);
  if (opts.json || opts.ci || opts.fix) {
    const { checkCommand } = await import('../commands/check.js');
    const code = await checkCommand(opts);
    process.exit(code);
  } else {
    const { interactiveCommand } = await import('../commands/interactive.js');
    const code = await interactiveCommand(opts);
    process.exit(code);
  }
});

// Non-blocking update check at startup
import('../telemetry.js').then((m) => m.checkForUpdates()).catch(() => {});

program.parse();
