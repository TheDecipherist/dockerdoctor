import type { CliOptions } from '../types/index.js';
import { checkCommand } from './check.js';

export async function networkCommand(opts: CliOptions): Promise<number> {
  return checkCommand(opts, ['network']);
}
