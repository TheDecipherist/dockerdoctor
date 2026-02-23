import type { CliOptions } from '../types/index.js';
import { checkCommand } from './check.js';

export async function dockerfileCommand(opts: CliOptions): Promise<number> {
  return checkCommand(opts, ['dockerfile']);
}
