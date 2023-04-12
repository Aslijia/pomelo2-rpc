import EventEmitter from 'events'

export class Dispatcher extends EventEmitter {
    services: { [ids: string]: any }
    constructor(services: { [ids: string]: any }) {
        super()
        this.on('reload', (services) => (this.services = services))
        this.services = services
    }

    /**
     * route the msg to appropriate service object
     *
     * @param msg msg package {service:serviceString, method:methodString, args:[]}
     * @param services services object collection, such as {service1: serviceObj1, service2: serviceObj2}
     * @param cb(...) callback function that should be invoked as soon as the rpc finished
     */
    route(msg: { namespace: 'sys' | 'user'; service: string; method: string; args: any }, cb: Function) {
        const namespace = this.services[msg.namespace]
        if (!namespace) {
            cb(new Error('no such namespace:' + msg.namespace))
            return
        }

        const service = namespace[msg.service]
        if (!service) {
            cb(new Error('no such service:' + msg.service))
            return
        }

        const method = service[msg.method]
        if (!method) {
            cb(new Error('no such method:' + msg.method))
            return
        }

        const args = msg.args
        args.push(cb)
        method.apply(service, args)
    }
}
