export type Severity = 'error' | 'warning' | 'info';

export type CheckCategory =
  | 'dockerfile'
  | 'compose'
  | 'build'
  | 'startup'
  | 'network'
  | 'performance'
  | 'image'
  | 'secrets'
  | 'lineendings'
  | 'cleanup'
  | 'dockerignore';

export interface Fix {
  description: string;
  type: 'auto' | 'manual';
  apply?: () => Promise<boolean>;
  instructions?: string;
}

export interface CheckResult {
  id: string;
  title: string;
  severity: Severity;
  category: CheckCategory;
  message: string;
  location?: string;
  line?: number;
  fixes: Fix[];
  meta?: Record<string, unknown>;
}

export interface Check {
  id: string;
  name: string;
  category: CheckCategory;
  requiresDocker: boolean;
  run(context: CheckContext): Promise<CheckResult[]>;
}

export interface DockerfileInstruction {
  name: string;
  args: string;
  lineno: number;
  raw: string;
  error?: string;
}

export interface DockerfileStage {
  name?: string;
  baseImage: string;
  instructions: DockerfileInstruction[];
  startLine: number;
}

export interface ParsedDockerfile {
  path: string;
  stages: DockerfileStage[];
  allInstructions: DockerfileInstruction[];
  raw: string;
}

export interface ComposeService {
  name: string;
  image?: string;
  build?: string | { context?: string; dockerfile?: string; args?: Record<string, string> };
  environment?: Record<string, string> | string[];
  env_file?: string | string[];
  ports?: string[];
  volumes?: string[];
  networks?: Record<string, { ipv4_address?: string; ipv6_address?: string } | null> | string[];
  healthcheck?: Record<string, unknown>;
  deploy?: Record<string, unknown>;
  depends_on?: string[] | Record<string, { condition?: string }>;
  restart?: string;
  [key: string]: unknown;
}

export interface ParsedCompose {
  path: string;
  version?: string;
  services: ComposeService[];
  networks: Record<string, unknown>;
  volumes: Record<string, unknown>;
  raw: string;
}

export interface DockerignoreEntry {
  pattern: string;
  negation: boolean;
  line: number;
}

export interface ParsedDockerignore {
  path: string;
  entries: DockerignoreEntry[];
  raw: string;
}

export interface CheckContext {
  cwd: string;
  dockerfile?: ParsedDockerfile;
  compose?: ParsedCompose;
  dockerignore?: ParsedDockerignore;
  dockerAvailable: boolean;
  files: {
    dockerfilePath?: string;
    composePath?: string;
    dockerignorePath?: string;
    gitattributesPath?: string;
    shellScripts: string[];
  };
}

export interface ReportSummary {
  total: number;
  errors: number;
  warnings: number;
  info: number;
  fixable: number;
}

export interface Report {
  timestamp: string;
  version: string;
  dockerAvailable: boolean;
  results: CheckResult[];
  summary: ReportSummary;
}

export interface CliOptions {
  json?: boolean;
  ci?: boolean;
  fix?: boolean;
  severity?: Severity;
  file?: string;
  composefile?: string;
}
