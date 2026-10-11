// Health endpoints.
//   GET /health       — liveness: process up (always 200, no dependencies)
//   GET /health/ready — readiness: liveness + database reachable (the bridge
//                       re-queries routes per request, so a dead DB = broken
//                       proxying even though the process is alive)
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({ ok: true }))
