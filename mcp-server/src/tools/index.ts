// ============================================================
// Tool registration — decides which tools exist for this process
// based on the write guards. Reads are always on; writes,
// broadcasts and deletes are opt-in (see config.ts).
// ============================================================

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WacrmClient } from '../client.js';
import type { Config } from '../config.js';
import { registerReadTools } from './read.js';
import { registerWriteTools } from './write.js';
import { registerBroadcastTools } from './broadcast.js';
import {
  registerObjectReadTools,
  registerObjectWriteTools,
  registerObjectDeleteTools,
} from './objects.js';
import {
  registerCrmReadTools,
  registerCrmWriteTools,
  registerCrmDeleteTools,
} from './crm.js';

export function registerTools(server: McpServer, client: WacrmClient, config: Config): string[] {
  const enabled: string[] = ['read'];
  registerReadTools(server, client);
  registerObjectReadTools(server, client);
  registerCrmReadTools(server, client);

  if (config.enableWrites) {
    registerWriteTools(server, client);
    registerObjectWriteTools(server, client);
    registerCrmWriteTools(server, client);
    enabled.push('write');
  }

  if (config.enableBroadcasts) {
    registerBroadcastTools(server, client);
    enabled.push('broadcast');
  }

  if (config.enableDeletes) {
    registerObjectDeleteTools(server, client);
    registerCrmDeleteTools(server, client);
    enabled.push('delete');
  }

  return enabled;
}
