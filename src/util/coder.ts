import { InputBuffer } from './buffer/inputBuffer'
import { OutputBuffer } from './buffer/outputBuffer'

export function encodeClient(id: number, msg: { namespace: string; serverType: string; service: string; method: string; args?: any }, servicesMap: any) {
    // logger.debug('[encodeClient] id %s msg %j', id, msg);
    const outBuf = new OutputBuffer()
    outBuf.writeUInt(id)
    outBuf.writeShort(servicesMap[0][msg.namespace])
    outBuf.writeShort(servicesMap[1][msg.service])
    outBuf.writeShort(servicesMap[2][msg.method])
    outBuf.writeObject(msg.args || [])
    return outBuf.getBuffer()
}

export function encodeServer(id: number, args: any) {
    // logger.debug('[encodeServer] id %s args %j', id, args);
    const outBuf = new OutputBuffer()
    outBuf.writeUInt(id)
    outBuf.writeObject(args)
    return outBuf.getBuffer()
}

export function decodeServer(buf: Buffer, servicesMap: any) {
    const inBuf = new InputBuffer(buf)
    const id = inBuf.readUInt()
    const namespace = servicesMap[3][inBuf.readShort()]
    const service = servicesMap[4][inBuf.readShort()]
    const method = servicesMap[5][inBuf.readShort()]
    const args = inBuf.readObject()
    // logger.debug('[decodeServer] namespace %s service %s method %s args %j', namespace, service, method, args)
    return {
        id: id,
        msg: {
            namespace: namespace,
            // serverType: serverType,
            service: service,
            method: method,
            args: args
        }
    }
}

export function decodeClient(buf: Buffer) {
    const inBuf = new InputBuffer(buf)
    const id = inBuf.readUInt()
    const resp = inBuf.readObject()
    // logger.debug('[decodeClient] id %s resp %j', id, resp);
    return {
        id: id,
        resp: resp
    }
}
