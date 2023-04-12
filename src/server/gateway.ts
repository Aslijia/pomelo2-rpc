import EventEmitter from 'events'
import { watch } from 'fs'
import { load } from 'pomelo2-loader'
import { Acceptor, ServerOptions, acceptorFactory } from '../..'
import acceptor from './acceptor'
import { Dispatcher } from './dispatcher'

export class Gateway extends EventEmitter {
    opts: ServerOptions
    port: number
    started: boolean
    stoped: boolean

    services: {
        sys: any
        user: any
    }
    acceptorFactory: acceptorFactory
    acceptor: Acceptor
    constructor(opts: ServerOptions) {
        super()
        this.opts = opts || {}
        this.port = opts.port || 3050
        this.started = false
        this.stoped = false
        this.acceptorFactory = opts.acceptorFactory || acceptor.mqttAcceptor
        this.services = opts.services
        var dispatcher = new Dispatcher(this.services)

        if (!!this.opts.reloadRemotes) {
            watchServices(this, dispatcher)
        }
        this.acceptor = this.acceptorFactory(opts, function (msg, cb) {
            dispatcher.route(msg, cb)
        })
    }

    stop() {
        if (!this.started || this.stoped) {
            return
        }
        this.stoped = true
        try {
            this.acceptor.close()
        } catch (err) {}
    }

    start() {
        if (this.started) {
            throw new Error('gateway already start.')
        }
        this.started = true

        var self = this
        this.acceptor.on('error', self.emit.bind(self, 'error'))
        this.acceptor.on('closed', self.emit.bind(self, 'closed'))
        this.acceptor.listen(this.port)
    }
}

function watchServices(gateway: Gateway, dispatcher: Dispatcher) {
    var paths = gateway.opts.paths
    var app = gateway.opts.context
    for (var i = 0; i < paths.length; i++) {
        ;(function (index) {
            watch(paths[index].path, function (event, name) {
                if (event === 'change') {
                    const res: { [ids: string]: any } = {}
                    const item = paths[index]
                    const m = load(item.path, app)
                    if (m) {
                        createNamespace(item.namespace, res)
                        for (let s in m) {
                            res[item.namespace][s] = m[s]
                        }
                    }
                    dispatcher.emit('reload', res)
                }
            })
        })(i)
    }
}

function createNamespace(namespace: 'sys' | 'user', proxies: any) {
    proxies[namespace] = proxies[namespace] || {}
}
