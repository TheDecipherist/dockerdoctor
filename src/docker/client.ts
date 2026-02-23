import Docker from 'dockerode';
import type { ContainerInfo, ImageInfo, VolumeInspectInfo } from 'dockerode';

let instance: Docker | null = null;

export function getClient(): Docker {
  if (!instance) {
    instance = new Docker();
  }
  return instance;
}

export function resetClient(): void {
  instance = null;
}

export async function ping(): Promise<boolean> {
  try {
    await getClient().ping();
    return true;
  } catch {
    return false;
  }
}

export interface ContainerSummary {
  id: string;
  names: string[];
  image: string;
  state: string;
  status: string;
  ports: Array<{ IP?: string; PrivatePort: number; PublicPort?: number; Type: string }>;
  labels: Record<string, string>;
  networkNames: string[];
  created: number;
}

function toContainerSummary(c: ContainerInfo): ContainerSummary {
  return {
    id: c.Id,
    names: (c.Names ?? []).map((n) => n.replace(/^\//, '')),
    image: c.Image,
    state: c.State,
    status: c.Status,
    ports: (c.Ports ?? []).map((p) => ({
      IP: p.IP,
      PrivatePort: p.PrivatePort,
      PublicPort: p.PublicPort,
      Type: p.Type,
    })),
    labels: c.Labels ?? {},
    networkNames: Object.keys(c.NetworkSettings?.Networks ?? {}),
    created: c.Created,
  };
}

export async function listContainers(opts?: { all?: boolean }): Promise<ContainerSummary[]> {
  const containers = await getClient().listContainers({ all: opts?.all ?? true });
  return containers.map(toContainerSummary);
}

export interface ImageSummary {
  id: string;
  repoTags: string[];
  size: number;
  created: number;
  labels: Record<string, string>;
}

function toImageSummary(img: ImageInfo): ImageSummary {
  return {
    id: img.Id,
    repoTags: img.RepoTags ?? [],
    size: img.Size,
    created: img.Created,
    labels: (img.Labels ?? {}) as Record<string, string>,
  };
}

export async function listImages(opts?: { dangling?: boolean }): Promise<ImageSummary[]> {
  const filters: Record<string, string[]> = {};
  if (opts?.dangling !== undefined) {
    filters.dangling = [String(opts.dangling)];
  }
  const images = await getClient().listImages({ filters });
  return images.map(toImageSummary);
}

export interface VolumeSummary {
  name: string;
  driver: string;
  mountpoint: string;
  labels: Record<string, string>;
}

function toVolumeSummary(v: VolumeInspectInfo): VolumeSummary {
  return {
    name: v.Name,
    driver: v.Driver,
    mountpoint: v.Mountpoint,
    labels: (v.Labels ?? {}) as Record<string, string>,
  };
}

export async function listVolumes(): Promise<VolumeSummary[]> {
  const result = await getClient().listVolumes();
  return (result.Volumes ?? []).map(toVolumeSummary);
}

export interface NetworkSummary {
  id: string;
  name: string;
  driver: string;
  scope: string;
  containers: Record<string, { name: string; ipv4: string }>;
}

export async function listNetworks(): Promise<NetworkSummary[]> {
  const networks = await getClient().listNetworks();
  return networks.map((n) => ({
    id: n.Id,
    name: n.Name,
    driver: n.Driver ?? '',
    scope: n.Scope ?? '',
    containers: Object.fromEntries(
      Object.entries(n.Containers ?? {}).map(([id, c]) => [
        id,
        { name: (c as { Name?: string }).Name ?? '', ipv4: (c as { IPv4Address?: string }).IPv4Address ?? '' },
      ]),
    ),
  }));
}

export async function inspectContainer(idOrName: string): Promise<Docker.ContainerInspectInfo> {
  return getClient().getContainer(idOrName).inspect();
}

export async function getContainerLogs(
  idOrName: string,
  opts?: { tail?: number },
): Promise<string> {
  const container = getClient().getContainer(idOrName);
  const logs = await container.logs({
    stdout: true,
    stderr: true,
    tail: opts?.tail ?? 100,
  });
  // dockerode returns a Buffer or string depending on tty setting
  return typeof logs === 'string' ? logs : logs.toString('utf-8');
}

export async function getDiskUsage(): Promise<{
  containers: number;
  images: number;
  volumes: number;
  buildCache: number;
  total: number;
}> {
  const df = await getClient().df();
  const containers = (df.Containers ?? []).reduce(
    (sum: number, c: { SizeRw?: number }) => sum + (c.SizeRw ?? 0),
    0,
  );
  const images = (df.Images ?? []).reduce(
    (sum: number, img: { Size?: number }) => sum + (img.Size ?? 0),
    0,
  );
  const volumes = (df.Volumes ?? []).reduce(
    (sum: number, v: { UsageData?: { Size?: number } }) => sum + (v.UsageData?.Size ?? 0),
    0,
  );
  const buildCache = (df.BuildCache ?? []).reduce(
    (sum: number, b: { Size?: number }) => sum + (b.Size ?? 0),
    0,
  );
  return { containers, images, volumes, buildCache, total: containers + images + volumes + buildCache };
}
