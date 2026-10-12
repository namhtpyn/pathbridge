// boot the access-log retention sweeper
import { startLogSweeper } from '../features/logs/access-log.service'

export default defineNitroPlugin(() => {
  startLogSweeper()
})
