import { ClientOptions, ServerOptions } from '..'
import client from './client/client'
import mailbox from './client/mailbox'
import acceptor from './server/acceptor'
import server from './server/server'

export const mailboxFactories = mailbox
export function createClient(opts: ClientOptions) {
    return client(opts)
}
export const acceptorFactories = acceptor
export function createServer(opts: ServerOptions) {
    return server(opts)
}
