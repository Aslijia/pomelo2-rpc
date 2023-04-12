import EventEmitter from 'events'
import { Server } from 'net'
import { getLogger } from 'pomelo2-logger'
import { ServerOptions } from '../../..'
const MqttCon = require('mqtt-connection')

let curId = 1

const logger = getLogger('pomelo-rpc')

export default function (opts: ServerOptions, cb: Function) {
    return new Acceptor(opts || {}, cb)
}

class Acceptor extends EventEmitter {
    interval: number
    bufferMsg?: boolean
    _interval: NodeJS.Timeout | undefined

    sockets: { [ids: string]: any } = {}
    msgQueues: { [ids: string]: any } = {}

    cb: Function

    server: Server | undefined
    inited: boolean = false
    closed: boolean = false
    constructor(opts: ServerOptions, cb: Function) {
        super()
        this.interval = opts.interval // flush interval in ms
        this.bufferMsg = opts.bufferMsg
        this.cb = cb
    }

    listen(port: number) {
        //check status
        if (!!this.inited) {
            this.cb(new Error('already inited.'))
            return
        }
        this.inited = true

        this.server = new Server()
        this.server.listen(port)

        this.server.on('error', (err) => {
            logger.error('rpc server is error: %j', err.stack)
            this.emit('error', err)
        })

        this.server.on('connection', (stream) => {
            const socket = MqttCon(stream)
            socket['id'] = curId++
            socket.on('publish', (pkg: any) => {
                pkg = pkg.payload.toString()
                let isArray = false
                try {
                    pkg = JSON.parse(pkg)
                    if (pkg instanceof Array) {
                        processMsgs(socket, this, pkg)
                        isArray = true
                    } else {
                        processMsg(socket, this, pkg)
                    }
                } catch (err: any) {
                    if (!isArray) {
                        doSend(socket, {
                            id: pkg.id,
                            resp: [cloneError(err)]
                        })
                    }
                    logger.error('process rpc message error %s', err.stack)
                }
            })

            socket.on('pingreq', () => {
                socket.pingresp()
            })

            socket.on('error', () => {
                this.onSocketClose(socket)
            })

            socket.on('close', () => {
                this.onSocketClose(socket)
            })

            this.sockets[socket.id] = socket

            socket.on('disconnect', () => {
                this.onSocketClose(socket)
            })
        })

        if (this.bufferMsg) {
            this._interval = setInterval(() => {
                flush(this)
            }, this.interval)
        }
    }

    close() {
        if (this.closed) {
            return
        }
        this.closed = true
        if (this._interval) {
            clearInterval(this._interval)
            this._interval = undefined
        }
        this.server && this.server.close()
        this.emit('closed')
    }

    onSocketClose(socket: any) {
        if (!socket['closed']) {
            const id = socket.id
            socket['closed'] = true
            delete this.sockets[id]
            delete this.msgQueues[id]
        }
    }
}

function cloneError(origin: any) {
    // copy the stack infos for Error instance json result is empty
    return {
        msg: origin.msg,
        stack: origin.stack
    }
}

function processMsg(socket: any, acceptor: Acceptor, pkg: any) {
    acceptor.cb(pkg.msg, function () {
        const len = arguments.length
        const args = new Array(len)
        for (let i = 0; i < len; i++) {
            args[i] = arguments[i]
        }
        const errorArg = args[0] // first callback argument can be error object, the others are message
        if (errorArg && errorArg instanceof Error) {
            args[0] = cloneError(errorArg)
        }

        const resp = {
            id: pkg.id,
            resp: args
        }

        if (acceptor.bufferMsg) {
            enqueue(socket, acceptor, resp)
        } else {
            doSend(socket, resp)
        }
    })
}

function processMsgs(socket: any, acceptor: Acceptor, pkgs: any[]) {
    for (let i = 0, l = pkgs.length; i < l; i++) {
        processMsg(socket, acceptor, pkgs[i])
    }
}

function enqueue(socket: any, acceptor: Acceptor, msg: any) {
    var id = socket.id
    var queue = acceptor.msgQueues[id]
    if (!queue) {
        queue = acceptor.msgQueues[id] = []
    }
    queue.push(msg)
}

function flush(acceptor: Acceptor) {
    let sockets = acceptor.sockets,
        queues = acceptor.msgQueues
    for (let socketId in queues) {
        const socket = sockets[socketId]
        if (!socket) {
            // clear pending messages if the socket not exist any more
            delete queues[socketId]
            continue
        }
        const queue = queues[socketId]
        if (!queue.length) {
            continue
        }
        doSend(socket, queue)
        queues[socketId] = []
    }
}

function doSend(socket: any, msg: any) {
    socket.publish({
        topic: 'rpc',
        payload: JSON.stringify(msg)
    })
}
