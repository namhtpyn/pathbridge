// appRouter: composes every module router into the single oRPC router
// mounted at /rpc (server/routes/rpc/[...].ts). Wire contract unchanged —
// adding a domain = new module + one spread line here.
import { os } from '@orpc/server'
import { metaRouter } from './meta/meta.router'
import { routesRouter } from './routes/routes.router'
import { logsRouter } from './logs/logs.router'
import { usersRouter } from './users/users.router'
import { rolesRouter } from './roles/roles.router'
import { settingsRouter } from './settings/settings.router'
import { oidcRouter } from './oidc/oidc.router'
import { keysRouter } from './keys/keys.router'

export const appRouter = os.router({
  ...metaRouter,
  routes: routesRouter,
  logs: logsRouter,
  users: usersRouter,
  roles: rolesRouter,
  settings: settingsRouter,
  oidc: oidcRouter,
  keys: keysRouter,
})

export type Router = typeof appRouter
