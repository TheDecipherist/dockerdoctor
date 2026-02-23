import type { CliOptions } from '../types/index.js';
import { checkCommand } from './check.js';

export async function buildCommand(opts: CliOptions): Promise<number> {
  return checkCommand(opts, ['build']);
}
