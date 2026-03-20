// MCP server entry points
// stdio: run directly via `node dist/mcp/server.js` (cortex-mcp binary)
// http:  run directly via `node dist/mcp/http-server.js` (cortex-serve binary)
//        or via `cortex serve` CLI command

export { startServer } from './http-server.js';
export type { ServeOptions } from './http-server.js';
