import { getLogger } from 'pomelo2-logger'

const logger = getLogger('pomelo-rpc')

declare type ProxyCB = (service: string, method: string, args: any, attach: any, x?: boolean) => void
/**
 * Create proxy.
 *
 * @param  {Object} opts construct parameters
 *           opts.origin {Object} delegated object
 *           opts.proxyCB {Function} proxy invoke callback
 *           opts.service {String} deletgated service name
 *           opts.attach {Object} attach parameter pass to proxyCB
 * @return {Object}      proxy instance
 */
export function create(opts: { origin: any; proxyCB: ProxyCB; service: string; attach: any }) {
    if (!opts || !opts.origin) {
        logger.warn('opts and opts.origin should not be empty.')
        return null
    }

    if (!opts.proxyCB || typeof opts.proxyCB !== 'function') {
        logger.warn('opts.proxyCB is not a function, return the origin module directly.')
        return opts.origin
    }

    return genObjectProxy(opts.service, opts.origin, opts.attach, opts.proxyCB)
}

function genObjectProxy(serviceName: string, origin: any, attach: any, proxyCB: ProxyCB) {
    //generate proxy for function field
    const res: { [ids: string]: any } = {}
    for (let field in origin) {
        if (typeof origin[field] === 'function') {
            res[field] = genFunctionProxy(serviceName, field, origin, attach, proxyCB)
        }
    }

    return res
}

/**
 * Generate prxoy for function type field
 *
 * @param namespace {String} current namespace
 * @param serverType {String} server type string
 * @param serviceName {String} delegated service name
 * @param methodName {String} delegated method name
 * @param origin {Object} origin object
 * @param proxyCB {Functoin} proxy callback function
 * @returns function proxy
 */
function genFunctionProxy(serviceName: string, methodName: string, origin: any, attach: any, proxyCB: ProxyCB) {
    return (function () {
        return function () {
            // var args = arguments;
            const len = arguments.length
            const args = new Array(len)
            for (var i = 0; i < len; i++) {
                args[i] = arguments[i]
            }
            proxyCB(serviceName, methodName, args, attach)
        }
    })()
}
