import type { Check, CheckCategory } from '../types/index.js';

const checks: Check[] = [];

export function registerCheck(check: Check): void {
  if (checks.some((c) => c.id === check.id)) {
    throw new Error(`Duplicate check ID: ${check.id}`);
  }
  checks.push(check);
}

export function getAllChecks(): Check[] {
  return [...checks];
}

export function getChecksByCategory(category: CheckCategory): Check[] {
  return checks.filter((c) => c.category === category);
}

export function getStaticChecks(): Check[] {
  return checks.filter((c) => !c.requiresDocker);
}

export function getRuntimeChecks(): Check[] {
  return checks.filter((c) => c.requiresDocker);
}
