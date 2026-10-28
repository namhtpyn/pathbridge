// boot the access-log retention sweeper; clear its timers when the app closes
// (HMR reloads otherwise stack one sweeper per instance)
import { startLogSweeper, stopLogSweeper } from '../domains/logs/access-log.service'

export default defineNitroPlugin((nitroApp) => {
  startLogSweeper()
  nitroApp.hooks.hook('close', () => stopLogSweeper())
})
