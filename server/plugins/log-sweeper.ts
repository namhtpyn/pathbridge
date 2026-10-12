// boot the access-log retention sweeper
import { startLogSweeper } from '../modules/logs/access-log.service'

export default defineNitroPlugin(() => {
  startLogSweeper()
})
