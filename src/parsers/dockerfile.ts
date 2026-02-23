import dockerFileParser from 'docker-file-parser';
import type { ParsedDockerfile, DockerfileStage, DockerfileInstruction } from '../types/index.js';

export function parseDockerfile(raw: string, path: string): ParsedDockerfile {
  const parsed = dockerFileParser.parse(raw, { includeComments: false });

  const allInstructions: DockerfileInstruction[] = parsed.map((entry) => ({
    name: entry.name?.toUpperCase() ?? '',
    args: typeof entry.args === 'string' ? entry.args : JSON.stringify(entry.args),
    lineno: entry.lineno ?? 0,
    raw: entry.raw ?? '',
    error: entry.error,
  }));

  const stages: DockerfileStage[] = [];
  let currentStage: DockerfileStage | null = null;

  for (const instr of allInstructions) {
    if (instr.name === 'FROM') {
      const fromArgs = instr.args.trim();
      // Parse "image AS name" pattern
      const asMatch = fromArgs.match(/^(.+?)\s+[Aa][Ss]\s+(\S+)$/);
      currentStage = {
        baseImage: asMatch ? asMatch[1].trim() : fromArgs,
        name: asMatch ? asMatch[2].trim() : undefined,
        instructions: [instr],
        startLine: instr.lineno,
      };
      stages.push(currentStage);
    } else if (currentStage) {
      currentStage.instructions.push(instr);
    }
  }

  // If no FROM found, treat all instructions as a single unnamed stage
  if (stages.length === 0 && allInstructions.length > 0) {
    stages.push({
      baseImage: '',
      instructions: allInstructions,
      startLine: allInstructions[0].lineno,
    });
  }

  return { path, stages, allInstructions, raw };
}
