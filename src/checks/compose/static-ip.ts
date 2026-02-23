import { registerCheck } from '../registry.js';
import type { CheckContext, CheckResult } from '../../types/index.js';

registerCheck({
  id: 'compose.static-ip',
  name: 'Static IP Address in Compose Network',
  category: 'compose',
  requiresDocker: false,

  async run(context: CheckContext): Promise<CheckResult[]> {
    if (!context.compose) return [];

    const results: CheckResult[] = [];

    for (const service of context.compose.services) {
      const networks = service.networks;
      if (!networks || Array.isArray(networks)) continue;

      // networks is Record<string, { ipv4_address?, ipv6_address? } | null>
      for (const [netName, netConfig] of Object.entries(networks)) {
        if (!netConfig || typeof netConfig !== 'object') continue;

        const ipv4 = (netConfig as Record<string, unknown>).ipv4_address;
        const ipv6 = (netConfig as Record<string, unknown>).ipv6_address;

        if (ipv4 || ipv6) {
          const addresses: string[] = [];
          if (ipv4) addresses.push(`ipv4_address: ${ipv4}`);
          if (ipv6) addresses.push(`ipv6_address: ${ipv6}`);

          results.push({
            id: 'compose.static-ip',
            title: `Service "${service.name}" uses static IP in network "${netName}"`,
            severity: 'warning',
            category: 'compose',
            message:
              `Service "${service.name}" has a static IP assignment (${addresses.join(', ')}) ` +
              `in network "${netName}". Static IPs cause conflicts when scaling services ` +
              `with \`docker compose up --scale\` because multiple replicas cannot share ` +
              `the same IP. They also make the compose file less portable across environments. ` +
              `Let Docker assign IPs automatically via its built-in DNS resolution.`,
            location: context.compose.path,
            fixes: [
              {
                description: 'Remove static IP assignments and use Docker DNS',
                type: 'manual',
                instructions:
                  `Remove the ipv4_address/ipv6_address from service "${service.name}" ` +
                  `in network "${netName}". Use Docker's built-in service discovery instead:\n\n` +
                  `  services:\n` +
                  `    ${service.name}:\n` +
                  `      networks:\n` +
                  `        - ${netName}\n\n` +
                  `Other services can reach "${service.name}" by its service name via DNS.`,
              },
            ],
            meta: {
              serviceName: service.name,
              networkName: netName,
              ipv4: ipv4 ?? null,
              ipv6: ipv6 ?? null,
            },
          });
        }
      }
    }

    return results;
  },
});
