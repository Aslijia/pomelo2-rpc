import EventEmitter from 'events'
import { getLogger } from 'pomelo2-logger'

const logger = getLogger('pomelo-rpc')
export class BlackHole extends EventEmitter {
    constructor() {
        super()
    }

    connect(cb: (err: Error | null) => void) {
        process.nextTick(function () {
            cb(new Error('fail to connect to remote server and switch to blackhole.'))
        })
    }

    close(cb: (err: Error | null) => void) {}

    send(msg: any, opts: any, cb: (err: Error | null) => void) {
        logger.info('message into blackhole', msg)
        process.nextTick(function () {
            cb(new Error('message was forward to blackhole.'))
        })
    }
}
