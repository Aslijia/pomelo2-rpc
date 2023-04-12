import EventEmitter from 'events'

import { getLogger } from 'pomelo2-logger'
import { ClientOptions, Filter, MailBox, mailboxFactory } from '../..'
import { DEFAULT_PARAM, RPC_ERROR } from '../util/constants'
import { applyCallback, getObjectClass } from '../util/utils'
import Mailbox from './mailbox'

const STATE_INITED = 1 // station has inited
const STATE_STARTED = 2 // station has started
const STATE_CLOSED = 3 // station has closed

const logger = getLogger('pomelo-rpc')

/**
 * Mail station constructor.
 *
 * @param {Object} opts construct parameters
 */
export class MailStation extends EventEmitter {
    opts: ClientOptions
    servers: { [ids: string]: { id: string; host: string; port: number; serverType: string } } = {}
    serversMap: { [types: string]: string[] } = {}
    onlines: { [ids: string]: number } = {}

    befores: Filter[] = []
    afters: Filter[] = []

    pendingSize: number
    pendings: any = {}
    connecting: { [ids: string]: boolean } = {}
    mailboxFactory: mailboxFactory
    mailboxes: { [ids: string]: MailBox } = {}
    state: number
    handleError?: (err: Error | null, serverId: string, msg: any, opts: any) => void
    constructor(opts: ClientOptions) {
        super()

        this.opts = opts
        this.mailboxFactory = opts.mailboxFactory || Mailbox.mqttMailbox
        // pending request queues
        this.pendingSize = opts.pendingSize || DEFAULT_PARAM.DEFAULT_PENDING_SIZE

        this.state = STATE_INITED
    }

    /**
     * Init and start station. Connect all mailbox to remote servers.
     *
     * @param  {Function} cb(err) callback function
     * @return {Void}
     */
    start(cb: (err: Error | null) => void) {
        if (this.state > STATE_INITED) {
            cb(new Error('station has started.'))
            return
        }

        process.nextTick(() => {
            this.state = STATE_STARTED
            cb(null)
        })
    }

    /**
     * Stop station and all its mailboxes
     *
     * @param  {Boolean} force whether stop station forcely
     * @return {Void}
     */
    stop(force: boolean) {
        if (this.state !== STATE_STARTED) {
            logger.warn('[pomelo-rpc] client is not running now.')
            return
        }
        this.state = STATE_CLOSED
        if (force) {
            for (let i in this.mailboxes) {
                this.mailboxes[i].close()
            }
        } else {
            setTimeout(() => {
                for (let i in this.mailboxes) {
                    this.mailboxes[i].close()
                }
            }, DEFAULT_PARAM.GRACE_TIMEOUT)
        }
    }

    /**
     * Add a new server info into the mail station and clear
     * the blackhole associated with the server id if any before.
     *
     * @param {Object} serverInfo server info such as {id, host, port}
     */
    addServer(serverInfo: { id: string; host: string; port: number; serverType: string }) {
        if (!serverInfo || !serverInfo.id) {
            return
        }
        this.servers[serverInfo.id] = serverInfo
        this.onlines[serverInfo.id] = 1

        if (!this.serversMap[serverInfo.serverType]) {
            this.serversMap[serverInfo.serverType] = []
        }

        if (!this.serversMap[serverInfo.serverType].includes(serverInfo.id)) {
            this.serversMap[serverInfo.serverType].push(serverInfo.id)
        }
        this.emit('addServer', serverInfo.id)
    }

    /**
     * Batch version for add new server info.
     *
     * @param {Array} serverInfos server info list
     */
    addServers(serverInfos: { id: string; host: string; port: number; serverType: string }[]) {
        if (!serverInfos || !serverInfos.length) {
            return
        }

        for (let i = 0, l = serverInfos.length; i < l; i++) {
            this.addServer(serverInfos[i])
        }
    }

    /**
     * Remove a server info from the mail station and remove
     * the mailbox instance associated with the server id.
     *
     * @param  {String|Number} id server id
     */
    removeServer(id: string) {
        this.onlines[id] = 0
        const mailbox = this.mailboxes[id]
        if (mailbox) {
            mailbox.close()
            delete this.mailboxes[id]
        }
        this.emit('removeServer', id)
    }

    /**
     * Batch version for remove remote servers.
     *
     * @param  {Array} ids server id list
     */
    removeServers(ids: string[]) {
        if (!ids || !ids.length) {
            return
        }

        for (let i = 0, l = ids.length; i < l; i++) {
            this.removeServer(ids[i])
        }
    }

    /**
     * Clear station infomation.
     *
     */
    clearStation() {
        this.onlines = {}
        this.serversMap = {}
    }

    /**
     * Replace remote servers info.
     *
     * @param {Array} serverInfos server info list
     */
    replaceServers(serverInfos: { id: string; host: string; port: number; serverType: string }[]) {
        this.clearStation()
        if (!serverInfos || !serverInfos.length) {
            return
        }

        for (let i = 0, l = serverInfos.length; i < l; i++) {
            const id = serverInfos[i].id
            const type = serverInfos[i].serverType
            this.onlines[id] = 1
            if (!this.serversMap[type]) {
                this.serversMap[type] = []
            }
            this.servers[id] = serverInfos[i]
            if (this.serversMap[type].indexOf(id) < 0) {
                this.serversMap[type].push(id)
            }
        }
    }

    /**
     * Dispatch rpc message to the mailbox
     *
     * @param  {Object}   tracer   rpc debug tracer
     * @param  {String}   serverId remote server id
     * @param  {Object}   msg      rpc invoke message
     * @param  {Object}   opts     rpc invoke option args
     * @param  {Function} cb       callback function
     * @return {Void}
     */
    dispatch(serverId: string, msg: any, opts: any, cb: (err: Error | null) => void) {
        if (this.state !== STATE_STARTED) {
            logger.error('[pomelo-rpc] client is not running now.')
            this.emit('error', RPC_ERROR.SERVER_NOT_STARTED, serverId, msg, opts)
            return
        }

        const mailbox = this.mailboxes[serverId]
        if (!mailbox) {
            // try to connect remote server if mailbox instance not exist yet
            if (!lazyConnect(this, serverId, this.mailboxFactory, cb)) {
                logger.error('[pomelo-rpc] fail to find remote server:' + serverId)
                this.emit('error', RPC_ERROR.NO_TRAGET_SERVER, serverId, msg, opts)
            }
            // push request to the pending queue
            addToPending(this, serverId, arguments)
            return
        }

        if (this.connecting[serverId]) {
            // if the mailbox is connecting to remote server
            addToPending(this, serverId, arguments)
            return
        }

        const send = (err: Error | null, serverId: string, msg: any, opts: any) => {
            const mailbox = this.mailboxes[serverId]
            if (err) {
                return errorHandler(this, err, serverId, msg, opts, true, cb)
            }
            if (!mailbox) {
                logger.error('[pomelo-rpc] could not find mailbox with id:' + serverId)
                this.emit('error', RPC_ERROR.FAIL_FIND_MAILBOX, serverId, msg, opts)
                return
            }
            mailbox.send(msg, opts, (send_err, args) => {
                // var tracer_send = arguments[0];
                // var send_err = arguments[1];
                if (send_err) {
                    logger.error('[pomelo-rpc] fail to send message %s', send_err.stack || send_err.message)
                    this.emit('error', RPC_ERROR.FAIL_SEND_MESSAGE, serverId, msg, opts)
                    cb && cb(send_err)
                    // utils.applyCallback(cb, send_err);
                    return
                }
                // var args = arguments[2];
                doFilter(null, serverId, msg, opts, this.afters, 0, (err, serverId, msg, opts) => {
                    if (err) {
                        errorHandler(this, err, serverId, msg, opts, false, cb)
                    }
                    applyCallback(cb, args)
                })
            })
        }

        doFilter(null, serverId, msg, opts, this.befores, 0, send)
    }

    /**
     * Add a before filter
     *
     * @param  {[type]} filter [description]
     * @return {[type]}        [description]
     */
    before(filter: Filter) {
        if (Array.isArray(filter)) {
            this.befores = this.befores.concat(filter)
            return
        }
        this.befores.push(filter)
    }

    /**
     * Add after filter
     *
     * @param  {[type]} filter [description]
     * @return {[type]}        [description]
     */
    after(filter: Filter) {
        if (Array.isArray(filter)) {
            this.afters = this.afters.concat(filter)
            return
        }
        this.afters.push(filter)
    }

    /**
     * Add before and after filter
     *
     * @param  {[type]} filter [description]
     * @return {[type]}        [description]
     */
    filter(filter: Filter) {
        this.befores.push(filter)
        this.afters.push(filter)
    }

    /**
     * Try to connect to remote server
     *
     * @param  {Object}   tracer   rpc debug tracer
     * @return {String}   serverId remote server id
     * @param  {Function}   cb     callback function
     */
    connect(serverId: string, cb: Function) {
        const mailbox = this.mailboxes[serverId]
        mailbox.connect((err) => {
            if (!!err) {
                logger.error('[pomelo-rpc] mailbox fail to connect to remote server: ' + serverId)
                if (!!this.mailboxes[serverId]) {
                    delete this.mailboxes[serverId]
                }
                this.emit('error', RPC_ERROR.FAIL_CONNECT_SERVER, serverId, null, this.opts)
                return
            }

            mailbox.on('close', (id) => {
                const mbox = this.mailboxes[id]
                if (!!mbox) {
                    mbox.close()
                    delete this.mailboxes[id]
                }
                this.emit('close', id)
            })
            delete this.connecting[serverId]
            flushPending(this, serverId)
        })
    }
}

declare type Callback = (err: Error | null, serverId: string, msg: any, opts: any) => void

/**
 * Do before or after filter
 */
function doFilter(err: Error | null, serverId: string, msg: any, opts: any, filters: Filter[], index: number, cb: Callback) {
    if (index >= filters.length || !!err) {
        cb(err, serverId, msg, opts)
        return
    }
    const filter = filters[index]
    if (typeof filter === 'function') {
        filter(serverId, msg, opts, function (target, message, options) {
            index++
            //compatible for pomelo filter next(err) method
            if (getObjectClass(target) === 'Error') {
                doFilter(target as any as Error, serverId, msg, opts, filters, index, cb)
            } else {
                doFilter(null, target || serverId, message || msg, options || opts, filters, index, cb)
            }
        })
        return
    }
    index++
    doFilter(err, serverId, msg, opts, filters, index, cb)
}

function lazyConnect(station: MailStation, serverId: string, factory: mailboxFactory, cb: Function) {
    const server = station.servers[serverId]
    const online = station.onlines[serverId]
    if (!server) {
        logger.error('[pomelo-rpc] unknown server: %s', serverId)
        return false
    }
    if (!online || online !== 1) {
        logger.error('[pomelo-rpc] server is not online: %s', serverId)
        return false
    }
    const mailbox = factory(server, station.opts)
    station.connecting[serverId] = true
    station.mailboxes[serverId] = mailbox
    station.connect(serverId, cb)
    return true
}

function addToPending(station: MailStation, serverId: string, args: any) {
    let pending = station.pendings[serverId]
    if (!pending) {
        pending = station.pendings[serverId] = []
    }
    if (pending.length > station.pendingSize) {
        logger.warn('[pomelo-rpc] station pending too much for: %s', serverId)
        return
    }
    pending.push(args)
}

function flushPending(station: MailStation, serverId: string, cb?: Function) {
    var pending = station.pendings[serverId]
    var mailbox = station.mailboxes[serverId]
    if (!pending || !pending.length) {
        return
    }
    if (!mailbox) {
        logger.error('[pomelo-rpc] fail to flush pending messages for empty mailbox: ' + serverId)
    }
    for (var i = 0, l = pending.length; i < l; i++) {
        station.dispatch.apply(station, pending[i])
    }
    delete station.pendings[serverId]
}

function errorHandler(station: MailStation, err: Error, serverId: string, msg: any, opts: any, flag?: boolean, cb?: Function) {
    if (!!station.handleError) {
        station.handleError(err, serverId, msg, opts)
    } else {
        logger.error('[pomelo-rpc] rpc filter error with serverId: %s, err: %j', serverId, err.stack)
        station.emit('error', RPC_ERROR.FILTER_ERROR, serverId, msg, opts)
    }
}
