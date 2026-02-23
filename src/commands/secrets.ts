import type { CliOptions } from '../types/index.js';
import { checkCommand } from './check.js';

export async function secretsCommand(opts: CliOptions): Promise<number> {
  return checkCommand(opts, ['secrets']);
}
