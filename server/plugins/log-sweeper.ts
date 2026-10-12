// boot the access-log retention sweeper
import { startLogSweeper } from '../domains/logs/access-log.service'

export default defineNitroPlugin(() => {
  startLogSweeper()
})
