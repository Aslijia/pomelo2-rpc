import { load } from 'pomelo2-loader'
import { ServerOptions } from '../..'
import { Gateway } from './gateway'

/**
 * Create rpc server.
 *
 * @param  {Object}      opts construct parameters
 *                       opts.port {Number|String} rpc server listen port
 *                       opts.paths {Array} remote service code paths, [{namespace, path}, ...]
 *                       opts.context {Object} context for remote service
 *                       opts.acceptorFactory {Object} (optionals)acceptorFactory.create(opts, cb)
 * @return {Object}      rpc server instance
 */
export default function (opts: ServerOptions) {
    if (!opts || !opts.port || opts.port < 0 || !opts.paths) {
        throw new Error('opts.port or opts.paths invalid.')
    }
    opts.services = loadRemoteServices(opts.paths, opts.context)
    return new Gateway(opts)
}

function loadRemoteServices(paths: { path: string; namespace: 'sys' | 'user' }[], context: any) {
    const res: { sys: any; user: any } = { sys: {}, user: {} }
    for (let i = 0, l = paths.length; i < l; i++) {
        const item = paths[i]
        const m = load(item.path, context)
        if (m) {
            createNamespace(item.namespace, res)
            for (let s in m) {
                res[item.namespace][s] = m[s]
            }
        }
    }
    return res
}

function createNamespace(namespace: 'sys' | 'user', proxies: { [ids: string]: any }) {
    proxies[namespace] = proxies[namespace] || {}
}
