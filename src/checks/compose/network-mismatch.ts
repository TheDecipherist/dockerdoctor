import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult, ComposeService } from '../../types/index.js';

function getServiceNetworks(service: ComposeService): string[] | null {
  const networks = service.networks;
  if (!networks) return null;
  if (Array.isArray(networks)) return networks;
  return Object.keys(networks);
}

function getDependencyNames(service: ComposeService): string[] {
  const dep = service.depends_on;
  if (!dep) return [];
  if (Array.isArray(dep)) return dep;
  return Object.keys(dep);
}

registerCheck({
  id: 'compose.network-mismatch',
  name: 'Depends-on Network Mismatch',
  category: 'compose',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.compose) return [];

    const results: CheckResult[] = [];
    const serviceMap = new Map<string, ComposeService>();

    for (const svc of context.compose.services) {
      serviceMap.set(svc.name, svc);
    }

    for (const service of context.compose.services) {
      const depNames = getDependencyNames(service);
      if (depNames.length === 0) continue;

      const serviceNets = getServiceNetworks(service);
      // If this service has no explicit networks, it's on the default — skip
      if (!serviceNets) continue;

      for (const depName of depNames) {
        const dep = serviceMap.get(depName);
        if (!dep) continue;

        const depNets = getServiceNetworks(dep);
        // If dependency has no explicit networks, it's on the default — skip
        if (!depNets) continue;

        // Both have explicit networks — check for overlap
        const shared = serviceNets.filter((n) => depNets.includes(n));
        if (shared.length === 0) {
          results.push({
            id: 'compose.network-mismatch',
            title: `Services "${service.name}" and "${depName}" share no network`,
            severity: 'warning',
            category: 'compose',
            message:
              `Service "${service.name}" depends on "${depName}", but they share no common network. ` +
              `"${service.name}" is on [${serviceNets.join(', ')}] while "${depName}" is on ` +
              `[${depNets.join(', ')}]. They will not be able to communicate. ` +
              `Add both services to a shared network.`,
            location: context.compose.path,
            fixes: [
              {
                description: `Add "${depName}" to a shared network with "${service.name}"`,
                type: 'manual',
                instructions:
                  `Add a common network to both services. For example, add "${serviceNets[0]}" ` +
                  `to the "${depName}" service:\n\n` +
                  `  services:\n` +
                  `    ${depName}:\n` +
                  `      networks:\n` +
                  `        - ${serviceNets[0]}`,
              },
            ],
            meta: {
              serviceName: service.name,
              dependencyName: depName,
              serviceNetworks: serviceNets,
              dependencyNetworks: depNets,
            },
          });
        }
      }
    }

    return results;
  },
});
