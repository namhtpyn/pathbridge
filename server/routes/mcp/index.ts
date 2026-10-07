import type { H3Event } from 'h3'
// POST|GET /mcp — Model Context Protocol server (streamable HTTP transport).
// Auth: the same requireSession as the REST API — Bearer API key (scoped,
// intersected with owner role) or session cookie. Tools = pairs CRUD + logs.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z, type ZodType } from 'zod'
import { toolListPairs, toolUpsertPair, toolUpdatePairById, toolDeletePair, toolGetLogs, mcpSchemas } from '../../utils/mcp/tools'
import { requireSession } from '../../utils/session'

// stateless mode: one transport per request, no session store
async function handle(event: H3Event): Promise<void> {
  // authenticate BEFORE building the server; 401s surface as HTTP, not tool errors
  await requireSession(event)

  const url = new URL(getRequestURL(event))
  const server = new McpServer({ name: 'pathbridge', version: '1.0.0' })

  const H = event.node.req.headers as Record<string, string | string[]>
  const headers = new Headers()
  for (const [k, v] of Object.entries(H)) {
    if (typeof v === 'string') headers.set(k, v)
    else if (Array.isArray(v)) for (const x of v) headers.append(k, x)
  }

  server.tool(
    'list_pairs',
    'List forwarding pairs (path -> target). Only pairs the API key may read are returned.',
    {},
    async () => ({ content: [{ type: 'text', text: JSON.stringify(await toolListPairs(headers), null, 2) }] }),
  )
  server.tool(
    'create_pair',
    'Create a forwarding pair (or update the existing pair at the same path). Fields: path (e.g. "/hook" or "/hook/*"), target (http(s) URL), optional upstreamHost, stripPrefix (wildcard only), methods (e.g. ["GET","HEAD"]), note, enabled.',
    mcpSchemas.createPair.shape as unknown as Record<string, ZodType>,
    async (input: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(await toolUpsertPair(headers, input), null, 2) }] }),
  )
  server.tool(
    'update_pair',
    'Update an existing pair by numeric id. Same fields as create_pair plus required id; path rename allowed.',
    mcpSchemas.updatePair.shape as unknown as Record<string, ZodType>,
    async (input: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(await toolUpdatePairById(headers, input), null, 2) }] }),
  )
  server.tool(
    'delete_pair',
    'Delete a forwarding pair by numeric id (preferred) or path.',
    mcpSchemas.deletePair.shape as unknown as Record<string, ZodType>,
    async (input: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(await toolDeletePair(headers, input), null, 2) }] }),
  )
  server.tool(
    'get_logs',
    'Read access-log entries for forwarded traffic. Optional limit (default 100) and pairId filter; scoped to what the key may read.',
    mcpSchemas.getLogs.shape as unknown as Record<string, ZodType>,
    async (input: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(await toolGetLogs(headers, input ?? {}), null, 2) }] }),
  )

  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined, // stateless: auth on every request
  })
  server.server.connect(transport)

  // node-server transport signature: (req, res, parsedBody?) — the body must
  // be pre-parsed JSON (req stream is already consumed by readRawBody)
  const raw = await readRawBody(event) ?? ''
  let parsedBody: unknown
  try { parsedBody = raw === '' ? undefined : JSON.parse(raw) } catch { parsedBody = undefined }
  await transport.handleRequest(event.node.req, event.node.res, parsedBody)
  // per-request transport in stateless mode; h3 must not write another response
  if (!event.node.res.headersSent) event.node.res.end()
  return
}

export default defineEventHandler(async (event) => {
  if (event.method !== 'POST' && event.method !== 'GET' && event.method !== 'DELETE') {
    throw createError({ statusCode: 405, statusMessage: 'method not allowed' })
  }
  if (event.method === 'DELETE') {
    // stateless server: no session to terminate
    return new Response(null, { status: 200 })
  }
  return await handle(event)
})
