declare interface Context {
    serverId: string
    getServersByType: (type: string) => { id: string; host: string; port: number; serverType: string }[]
}

declare interface MailBox {
    close(): void
    send(msg: any, opts: any, cb: (err: Error | null, ...args: any[]) => void): void
    connect(cb: (err: Error | null) => void): void
    on(event: 'close', listener: (id: string) => void): void
}

declare type Filter = (serverId: string, msg: any, opts: any, cb: (target: string | undefined, msg: any, opts: any) => void) => void
declare type mailboxFactory = (server: { id: string; host: string; port: number; serverType: string }, opts: ClientOptions) => MailBox
declare interface ClientOptions {
    bufferMsg?: boolean
    keepalive?: number
    interval?: number
    timeout?: number

    rpcDebugLog?: Logger
    pkgSize?: number

    clientId?: string
    context: Context
    routeContext: any
    hashFieldIndex?: number
    mailboxFactory?: mailboxFactory
    pendingSize?: number

    replicas?: number
    algorithm?: string

    router?: (...args: any[]) => void
    routerType?: string

    failMode?: string
}

declare interface Acceptor {
    close(): void

    on(event: 'error', listener: (err: Error) => void): void
    on(event: 'closed', listener: () => void): void

    listen(port: number): void
}

declare type acceptorFactory = (opts: ServerOptions, cb: (msg: any, fn: Function) => void) => Acceptor
declare interface ServerOptions {
    interval: number
    port: number
    paths: { path: string; namespace: 'sys' | 'user' }[]
    context: Context
    services: { sys: any; user: any }

    bufferMsg?: boolean
    rpcLogger?: Logger
    rpcDebugLog?: Logger
    pkgSize?: number
    whitelist?: string[]
    reloadRemotes?: boolean

    acceptorFactory?: acceptorFactory
}
declare interface proxyInfo {
    [server: string]: {
        [service: string]: {
            [method: string]: (server: { serverId: string }, ...args: any[]) => void
        }
    }
}

declare interface Client {
    opts: ClientOptions
    _station: MailStation
    rrParam?: { [ids: string]: number }
    wrrParam?: { [ids: string]: { index: number; weight: number } }
    laParam?: { [types: string]: { [ids: string]: number } }
    chParam?: { [types: string]: { consistentHash: any } }

    proxies: {
        user: proxyInfo
        sys: proxyInfo
    }

    start(cb: Function): void
    stop(force?: boolean): void

    addProxy(record: { namespace: 'sys' | 'user'; serverType: string; path: string }): void
    addProxies(records: { namespace: 'sys' | 'user'; serverType: string; path: string }[]): void
    addServer(server: { id: string; host: string; port: number; serverType: string }): void
    addServers(servers: { id: string; host: string; port: number; serverType: string }[]): void
    removeServer(id: string): void
    removeServers(ids: string[]): void
    replaceServers(servers: { id: string; host: string; port: number; serverType: string }[]): void

    rpcInvoke(serverId: string, msg: any, cb: (err: Error | null) => void): void
    before(filter: Filter): void
    after(filter: Filter): void
    filter(filter: Filter): void
    setErrorHandler(handler: (err: Error | null, serverId: string, msg: any, opts: any) => void): void
}

declare interface Server {
    start(): void
    stop(): void
}

export const mailboxFactories: {
    mqttMailbox: mailboxFactory
}
export const acceptorFactories: {
    mqttAcceptor: acceptorFactory
}
export declare function createClient(opts: ClientOptions): Client
export declare function createServer(opts: ServerOptions): Server
