import { getLogger } from 'pomelo2-logger'
import { getType, typeMap } from '../utils'

const BUFFER_SIZE_DEFAULT = 32

const logger = getLogger('pomelo2-logger')
export class OutputBuffer {
    count: number
    size: number
    buf: Buffer
    offset: number
    constructor(size?: number) {
        this.count = 0
        this.size = size || BUFFER_SIZE_DEFAULT
        this.buf = Buffer.alloc(this.size)
        this.offset = 0
    }

    getData() {
        return this.buf
    }

    getBuffer() {
        return this.buf.slice(0, this.offset)
    }

    getLength() {
        return this.count
    }

    write(data: any, offset: number, len: number) {
        this.ensureCapacity(len)
        this.buf.write(data, offset, len)
        this.count += len
    }

    writeBoolean(v: boolean) {
        this.writeByte(v ? 1 : 0)
    }

    writeByte(v: number) {
        this.ensureCapacity(1)
        this.buf.writeUInt8(v, this.count++)
    }

    writeBytes(bytes: number[]) {
        const len = bytes.length
        this.ensureCapacity(len + 4)
        this.writeInt(len)
        for (let i = 0; i < len; i++) {
            this.buf.writeUInt8(bytes[i], this.count++)
        }
    }

    writeChar(v: number) {
        this.writeByte(v)
    }

    writeChars(bytes: number[]) {
        this.writeBytes(bytes)
    }

    writeDouble(v: number) {
        this.ensureCapacity(8)
        this.buf.writeDoubleLE(v, this.count)
        this.count += 8
    }

    writeFloat(v: number) {
        this.ensureCapacity(4)
        this.buf.writeFloatLE(v, this.count)
        this.count += 4
    }

    writeInt(v: number) {
        this.ensureCapacity(4)
        this.buf.writeInt32LE(v, this.count)
        this.count += 4
    }

    writeShort(v: number) {
        this.ensureCapacity(2)
        this.buf.writeInt16LE(v, this.count)
        this.count += 2
    }

    writeUInt(v: number) {
        this.ensureCapacity(4)
        this.buf.writeUInt32LE(v, this.count)
        this.count += 4
    }

    writeUShort(v: number) {
        this.ensureCapacity(2)
        this.buf.writeUInt16LE(v, this.count)
        this.count += 2
    }

    writeString(str: string) {
        const len = Buffer.byteLength(str)
        this.ensureCapacity(len + 4)
        this.writeInt(len)
        this.buf.write(str, this.count, len)
        this.count += len
    }

    writeObject(object: any) {
        const type = getType(object)
        // console.log('writeObject type %s', type);
        // console.log(object)
        if (!type) {
            logger.error('invalid writeObject ' + object)
            return
        }

        this.writeShort(type)

        if (typeMap['null'] == type) {
            return
        }

        if (typeMap['buffer'] == type) {
            this.writeBytes(object as any)
            return
        }

        if (typeMap['array'] == type) {
            var len = object.length
            this.writeInt(len)
            for (var i = 0; i < len; i++) {
                this.writeObject(object[i])
            }
            return
        }

        if (typeMap['string'] == type) {
            this.writeString(object)
            return
        }

        if (typeMap['object'] == type) {
            this.writeString(JSON.stringify(object))
            // logger.error('invalid writeObject object must be bearcat beans and should implement writeFields and readFields interfaces');
            return
        }

        if (typeMap['bean'] == type) {
            this.writeString(object['$id'])
            object.writeFields(this)
            return
        }

        if (typeMap['boolean'] == type) {
            this.writeBoolean(object)
            return
        }

        if (typeMap['float'] == type) {
            this.writeFloat(object)
            return
        }

        if (typeMap['number'] == type) {
            this.writeInt(object)
            return
        }
    }

    ensureCapacity(len: number) {
        const minCapacity = this.count + len
        if (minCapacity > this.buf.length) {
            this.grow(minCapacity) // double grow
        }
    }

    grow(minCapacity: number) {
        const oldCapacity = this.buf.length
        let newCapacity = oldCapacity << 1
        if (newCapacity - minCapacity < 0) {
            newCapacity = minCapacity
        }

        if (newCapacity < 0 && minCapacity < 0) {
            throw new Error('OutOfMemoryError')
        }

        // console.log('grow minCapacity %d newCapacity %d', minCapacity, newCapacity);
        var newBuf = new Buffer(newCapacity)
        this.buf.copy(newBuf)
        this.buf = newBuf
    }
}
