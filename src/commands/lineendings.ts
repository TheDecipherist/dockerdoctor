import type { CliOptions } from '../types/index.js';
import { checkCommand } from './check.js';

export async function lineendingsCommand(opts: CliOptions): Promise<number> {
  return checkCommand(opts, ['lineendings']);
}
