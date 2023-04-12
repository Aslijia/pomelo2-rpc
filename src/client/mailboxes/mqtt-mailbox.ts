import EventEmitter from 'events'
import { createConnection } from 'net'
import { getLogger } from 'pomelo2-logger'
import { ClientOptions, mailboxFactory } from '../../..'
import { DEFAULT_PARAM } from '../../util/constants'
const MqttCon = require('mqtt-connection')

const CONNECT_TIMEOUT = 2000

export default (function (server: { id: string; host: string; port: number; serverType: string }, opts: ClientOptions) {
    return new MailBox(server, opts || {})
} as mailboxFactory)

const logger = getLogger('pomelo-rpc')

class MailBox extends EventEmitter {
    opts: ClientOptions
    server: { id: string; host: string; port: number }
    curId: number = 0
    bufferMsg?: boolean
    keepalive: number
    interval: number
    timeoutValue: number
    keepaliveTimer?: NodeJS.Timeout

    serverId: string
    closed: boolean = false
    connected: boolean = false
    lastPing: number = -1
    lastPong: number = -1

    requests: { [ids: string]: (err?: Error | null, ...args: any[]) => void } = {}
    timeout: { [ids: string]: NodeJS.Timeout } = {}

    queue: any[] = []
    socket: any

    _interval: NodeJS.Timeout | undefined
    constructor(server: { id: string; host: string; port: number }, opts: ClientOptions) {
        super()
        this.server = server

        this.bufferMsg = opts.bufferMsg
        this.keepalive = opts.keepalive || DEFAULT_PARAM.KEEPALIVE
        this.interval = opts.interval || DEFAULT_PARAM.INTERVAL
        this.timeoutValue = opts.timeout || DEFAULT_PARAM.CALLBACK_TIMEOUT
        this.opts = opts
        this.serverId = opts.context.serverId
    }

    connect(cb: (err: Error | null) => void) {
        if (this.connected) {
            return cb(new Error('mailbox has already connected.'))
        }
        const stream = createConnection(this.server.port, this.server.host)
        this.socket = MqttCon(stream)

        const connectTimeout = setTimeout(() => {
            logger.error('rpc client %s connect to remote server %s timeout', this.serverId, this.server.id)
            this.emit('close', this.server.id)
        }, CONNECT_TIMEOUT)

        this.socket.connect(
            {
                clientId: 'MQTT_RPC_' + Date.now()
            },
            () => {
                if (this.connected) {
                    return
                }

                clearTimeout(connectTimeout)
                this.connected = true
                if (this.bufferMsg) {
                    this._interval = setInterval(() => {
                        flush(this)
                    }, this.interval)
                }

                this.setupKeepAlive()
                cb(null)
            }
        )

        this.socket.on('publish', (pkg: any) => {
            pkg = pkg.payload.toString()
            try {
                pkg = JSON.parse(pkg)
                if (pkg instanceof Array) {
                    processMsgs(this, pkg)
                } else {
                    processMsg(this, pkg)
                }
            } catch (err: any) {
                logger.error('rpc client %s process remote server %s message with error: %s', this.serverId, this.server.id, err.stack)
            }
        })

        this.socket.on('error', (err: Error) => {
            logger.error('rpc socket %s is error, remote server %s host: %s, port: %s', this.serverId, this.server.id, this.server.host, this.server.port)
            this.emit('close', this.server.id)
        })

        this.socket.on('pingresp', () => {
            this.lastPong = Date.now()
        })

        this.socket.on('disconnect', (reason: string) => {
            logger.error('rpc socket %s is disconnect from remote server %s, reason: %s', this.serverId, this.server.id, reason)
            const reqs = this.requests
            for (let id in reqs) {
                const ReqCb = reqs[id]
                ReqCb(new Error(this.serverId + ' disconnect with remote server ' + this.server.id))
            }
            this.emit('close', this.server.id)
        })
    }

    /**
     * close mailbox
     */
    close() {
        if (this.closed) {
            return
        }
        this.closed = true
        this.connected = false
        if (this._interval) {
            clearInterval(this._interval)
            this._interval = undefined
        }
        this.socket.destroy()
    }

    /**
     * send message to remote server
     *
     * @param msg {service:"", method:"", args:[]}
     * @param opts {} attach info to send method
     * @param cb declaration decided by remote interface
     */
    send(msg: any, opts: any, cb: (err?: Error | null) => void) {
        if (!this.connected) {
            cb(new Error(this.serverId + ' mqtt-mailbox is not init ' + this.server.id))
            return
        }

        if (this.closed) {
            cb(new Error(this.serverId + ' mqtt-mailbox has already closed ' + this.server.id))
            return
        }

        const id = this.curId++
        this.requests[id] = cb
        setCbTimeout(this, id, cb)

        const pkg = {
            id: id,
            msg: msg
        }

        if (this.bufferMsg) {
            enqueue(this, pkg)
        } else {
            doSend(this.socket, pkg)
        }
    }

    setupKeepAlive() {
        this.keepaliveTimer = setInterval(() => {
            this.checkKeepAlive()
        }, this.keepalive)
    }

    checkKeepAlive() {
        if (this.closed) {
            return
        }

        // console.log('checkKeepAlive lastPing %d lastPong %d ~~~', this.lastPing, this.lastPong);
        const now = Date.now()
        const KEEP_ALIVE_TIMEOUT = this.keepalive * 2
        if (this.lastPing > 0) {
            if (this.lastPong < this.lastPing) {
                if (now - this.lastPing > KEEP_ALIVE_TIMEOUT) {
                    logger.error(
                        'mqtt rpc client %s checkKeepAlive timeout from remote server %s for %d lastPing: %s lastPong: %s',
                        this.serverId,
                        this.server.id,
                        KEEP_ALIVE_TIMEOUT,
                        this.lastPing,
                        this.lastPong
                    )
                    this.emit('close', this.server.id)
                    this.lastPing = -1
                    // this.close();
                }
            } else {
                this.socket.pingreq()
                this.lastPing = Date.now()
            }
        } else {
            this.socket.pingreq()
            this.lastPing = Date.now()
        }
    }
}

function enqueue(mailbox: MailBox, msg: any) {
    mailbox.queue.push(msg)
}

function flush(mailbox: MailBox) {
    if (mailbox.closed || !mailbox.queue.length) {
        return
    }
    doSend(mailbox.socket, mailbox.queue)
    mailbox.queue = []
}

function doSend(socket: any, msg: any) {
    socket.publish({
        topic: 'rpc',
        payload: JSON.stringify(msg)
    })
}

function processMsgs(mailbox: MailBox, pkgs: any[]) {
    for (let i = 0, l = pkgs.length; i < l; i++) {
        processMsg(mailbox, pkgs[i])
    }
}

function processMsg(mailbox: MailBox, pkg: any) {
    const pkgId = pkg.id
    clearCbTimeout(mailbox, pkgId)
    const cb = mailbox.requests[pkgId]
    if (!cb) {
        return
    }

    delete mailbox.requests[pkgId]
    cb(null, pkg.resp)
}

function setCbTimeout(mailbox: MailBox, id: number, cb: (err: Error | null) => void) {
    const timer = setTimeout(() => {
        // logger.warn('rpc request is timeout, id: %s, host: %s, port: %s', id, mailbox.host, mailbox.port);
        clearCbTimeout(mailbox, id)
        if (mailbox.requests[id]) {
            delete mailbox.requests[id]
        }
        const eMsg = `rpc ${mailbox.serverId} callback timeout ${mailbox.timeoutValue}, remote server ${id} host: ${mailbox.server.host}, port: ${mailbox.server.port}`
        logger.error(eMsg)
        cb(new Error(eMsg))
    }, mailbox.timeoutValue)
    mailbox.timeout[id] = timer
}

function clearCbTimeout(mailbox: MailBox, id: number) {
    if (!mailbox.timeout[id]) {
        return
    }
    clearTimeout(mailbox.timeout[id])
    delete mailbox.timeout[id]
}
