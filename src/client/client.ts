import { each } from 'async'
import { load } from 'pomelo2-loader'
import { getLogger } from 'pomelo2-logger'
import { ClientOptions, Context, Filter, proxyInfo } from '../..'
import { ConsistentHash } from '../util/consistentHash'
import { SCHEDULE } from '../util/constants'
import { create } from '../util/proxy'
import { MailStation } from './mailstation'
import { chRoute, defRoute, laRoute, rdRoute, rrRoute, wrrRoute } from './router'

export default function (opts: ClientOptions) {
    return new Client(opts)
}

/**
 * Client states
 */
const STATE_INITED = 1 // client has inited
const STATE_STARTED = 2 // client has started
const STATE_CLOSED = 3 // client has closed

const logger = getLogger('pomelo-rpc')
/**
 * RPC Client Class
 */
class Client {
    opts: ClientOptions
    _context: Context
    _routeContext: any
    state: number = STATE_INITED

    router: (...args: any[]) => void
    routerType?: string

    rrParam?: { [ids: string]: number }
    wrrParam?: { [ids: string]: { index: number; weight: number } }
    laParam?: { [types: string]: { [ids: string]: number } }
    chParam?: { [types: string]: { consistentHash: ConsistentHash } }

    _station: MailStation

    proxies: { sys: proxyInfo; user: proxyInfo } = { sys: {}, user: {} }
    constructor(opts: ClientOptions) {
        opts = opts || {}
        this._context = opts.context
        this._routeContext = opts.routeContext
        this.router = opts.router || defRoute
        this.routerType = opts.routerType
        if (this._context) {
            opts.clientId = this._context.serverId
        }
        this.opts = opts
        this._station = createStation(opts)
    }

    /**
     * Start the rpc client which would try to connect the remote servers and
     * report the result by cb.
     *
     * @param cb {Function} cb(err)
     */
    start(cb: Function) {
        if (this.state > STATE_INITED) {
            cb(new Error('rpc client has started.'))
            return
        }

        this._station.start((err) => {
            if (err) {
                logger.error('[pomelo-rpc] client start fail for ' + err.stack)
                return cb(err)
            }
            this.state = STATE_STARTED
            cb()
        })
    }

    /**
     * Stop the rpc client.
     *
     * @param  {Boolean} force
     * @return {Void}
     */
    stop(force: boolean) {
        if (this.state !== STATE_STARTED) {
            logger.warn('[pomelo-rpc] client is not running now.')
            return
        }
        this.state = STATE_CLOSED
        this._station.stop(force)
    }

    /**
     * Add a new proxy to the rpc client which would overrid the proxy under the
     * same key.
     *
     * @param {Object} record proxy description record, format:
     *                        {namespace, serverType, path}
     */
    addProxy(record: { namespace: 'sys' | 'user'; serverType: string; path: string }) {
        if (!record) {
            return
        }
        const proxy = generateProxy(this, record, this._context)
        if (!proxy) {
            return
        }
        insertProxy(this.proxies, record.namespace, record.serverType, proxy)
    }

    /**
     * Batch version for addProxy.
     *
     * @param {Array} records list of proxy description record
     */
    addProxies(records: { namespace: 'sys' | 'user'; serverType: string; path: string }[]) {
        if (!records || !records.length) {
            return
        }
        for (let i = 0, l = records.length; i < l; i++) {
            this.addProxy(records[i])
        }
    }

    /**
     * Add new remote server to the rpc client.
     *
     * @param {Object} server new server information
     */
    addServer(server: { id: string; host: string; port: number; serverType: string }) {
        this._station.addServer(server)
    }

    /**
     * Batch version for add new remote server.
     *
     * @param {Array} servers server info list
     */
    addServers(servers: { id: string; host: string; port: number; serverType: string }[]) {
        this._station.addServers(servers)
    }

    /**
     * Remove remote server from the rpc client.
     *
     * @param  {String|Number} id server id
     */
    removeServer(id: string) {
        this._station.removeServer(id)
    }

    /**
     * Batch version for remove remote server.
     *
     * @param  {Array} ids remote server id list
     */
    removeServers(ids: string[]) {
        this._station.removeServers(ids)
    }

    /**
     * Replace remote servers.
     *
     * @param {Array} servers server info list
     */
    replaceServers(servers: { id: string; host: string; port: number; serverType: string }[]) {
        this._station.replaceServers(servers)
    }

    /**
     * Do the rpc invoke directly.
     *
     * @param serverId {String} remote server id
     * @param msg {Object} rpc message. Message format:
     *    {serverType: serverType, service: serviceName, method: methodName, args: arguments}
     * @param cb {Function} cb(err, ...)
     */
    rpcInvoke(serverId: string, msg: any, cb: (err: Error | null) => void) {
        if (this.state !== STATE_STARTED) {
            logger.error('[pomelo-rpc] fail to do rpc invoke for client is not running')
            cb(new Error('[pomelo-rpc] fail to do rpc invoke for client is not running'))
            return
        }
        this._station.dispatch(serverId, msg, this.opts, cb)
    }

    /**
     * Add rpc before filter.
     *
     * @param filter {Function} rpc before filter function.
     *
     * @api public
     */
    before(filter: Filter) {
        this._station.before(filter)
    }

    /**
     * Add rpc after filter.
     *
     * @param filter {Function} rpc after filter function.
     *
     * @api public
     */
    after(filter: Filter) {
        this._station.after(filter)
    }

    /**
     * Add rpc filter.
     *
     * @param filter {Function} rpc filter function.
     *
     * @api public
     */
    filter(filter: Filter) {
        this._station.filter(filter)
    }

    /**
     * Set rpc filter error handler.
     *
     * @param handler {Function} rpc filter error handler function.
     *
     * @api public
     */
    setErrorHandler(handler: (err: Error | null, serverId: string, msg: any, opts: any) => void) {
        this._station.handleError = handler
    }
}

/**
 * Create mail station.
 *
 * @param opts {Object} construct parameters.
 *
 * @api private
 */
function createStation(opts: ClientOptions) {
    return new MailStation(opts)
}

/**
 * Generate proxies for remote servers.
 *
 * @param client {Object} current client instance.
 * @param record {Object} proxy reocrd info. {namespace, serverType, path}
 * @param context {Object} mailbox init context parameter
 *
 * @api private
 */
function generateProxy(client: Client, record: { path: string }, context: Context) {
    if (!record) {
        return
    }

    const modules = load(record.path, context)
    if (modules) {
        const res: { [ids: string]: any } = {}
        for (let name in modules) {
            res[name] = create({
                service: name,
                origin: modules[name],
                attach: record,
                proxyCB: proxyCB.bind(null, client)
            })
        }
        return res
    }
}

/**
 * Generate prxoy for function type field
 *
 * @param client {Object} current client instance.
 * @param serviceName {String} delegated service name.
 * @param methodName {String} delegated method name.
 * @param args {Object} rpc invoke arguments.
 * @param attach {Object} attach parameter pass to proxyCB.
 * @param isToSpecifiedServer {boolean} true means rpc route to specified remote server.
 *
 * @api private
 */
function proxyCB(client: Client, serviceName: string, methodName: string, args: any, attach: any, isToSpecifiedServer?: boolean) {
    if (client.state !== STATE_STARTED) {
        logger.error('[pomelo-rpc] fail to invoke rpc proxy for client is not running')
        return
    }
    if (args.length < 2) {
        logger.error(
            '[pomelo-rpc] invalid rpc invoke, arguments length less than 2, namespace: %j, serverType, %j, serviceName: %j, methodName: %j',
            attach.namespace,
            attach.serverType,
            serviceName,
            methodName
        )
        return
    }
    const routeParam = args.shift()
    const cb = args.pop()
    const serverType = attach.serverType
    const msg = {
        namespace: attach.namespace,
        serverType: serverType,
        service: serviceName,
        method: methodName,
        args: args
    }

    if (isToSpecifiedServer) {
        rpcToSpecifiedServer(client, msg, serverType, routeParam, cb)
    } else {
        getRouteTarget(client, serverType, msg, routeParam, function (err, serverId) {
            if (err) {
                return cb(err)
            }
            serverId && client.rpcInvoke(serverId, msg, cb)
        })
    }
}

/**
 * Calculate remote target server id for rpc client.
 *
 * @param client {Object} current client instance.
 * @param serverType {String} remote server type.
 * @param routeParam {Object} mailbox init context parameter.
 * @param cb {Function} return rpc remote target server id.
 *
 * @api private
 */
function getRouteTarget(client: Client, serverType: string, msg: any, routeParam: any, cb: (err: Error | null, serverId?: string) => void) {
    if (!!client.routerType) {
        var method
        switch (client.routerType) {
            case SCHEDULE.ROUNDROBIN:
                method = rrRoute
                break
            case SCHEDULE.WEIGHT_ROUNDROBIN:
                method = wrrRoute
                break
            case SCHEDULE.LEAST_ACTIVE:
                method = laRoute
                break
            case SCHEDULE.CONSISTENT_HASH:
                method = chRoute
                break
            default:
                method = rdRoute
                break
        }
        method.call(null, client, serverType, msg, function (err, serverId) {
            cb(err, serverId)
        })
    } else {
        client.router.call(null, routeParam, msg, client._routeContext, function (err: Error, serverId: string) {
            cb(err, serverId)
        })
    }
}

/**
 * Rpc to specified server id or servers.
 *
 * @param client     {Object} current client instance.
 * @param msg        {Object} rpc message.
 * @param serverType {String} remote server type.
 * @param serverId   {Object} mailbox init context parameter.
 *
 * @api private
 */
function rpcToSpecifiedServer(client: Client, msg: any, serverType: string, serverId: string, cb: (err?: Error | null) => void) {
    if (typeof serverId !== 'string') {
        logger.error('[pomelo-rpc] serverId is not a string : %s', serverId)
        return
    }
    if (serverId === '*') {
        const servers = client._routeContext.getServersByType(serverType)
        if (!servers) {
            logger.error('[pomelo-rpc] serverType %s servers not exist', serverType)
            return
        }

        each(
            servers,
            function (server: any, next) {
                var serverId = server['id']
                client.rpcInvoke(serverId, msg, function (err) {
                    next(err)
                })
            },
            cb
        )
    } else {
        client.rpcInvoke(serverId, msg, cb)
    }
}

/**
 * Add proxy into array.
 *
 * @param proxies {Object} rpc proxies
 * @param namespace {String} rpc namespace sys/user
 * @param serverType {String} rpc remote server type
 * @param proxy {Object} rpc proxy
 *
 * @api private
 */
function insertProxy(proxies: { sys?: any; user?: any }, namespace: 'sys' | 'user', serverType: string, proxy: any) {
    proxies[namespace] = proxies[namespace] || {}
    if (proxies[namespace][serverType]) {
        for (var attr in proxy) {
            proxies[namespace][serverType][attr] = proxy[attr]
        }
    } else {
        proxies[namespace][serverType] = proxy
    }
}
