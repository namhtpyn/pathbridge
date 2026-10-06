// boot the access-log retention sweeper
import { startLogSweeper } from '../utils/access-log'

export default defineNitroPlugin(() => {
  startLogSweeper()
})
