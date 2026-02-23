import type { CliOptions } from '../types/index.js';
import { checkCommand } from './check.js';

export async function startupCommand(opts: CliOptions): Promise<number> {
  return checkCommand(opts, ['startup']);
}
