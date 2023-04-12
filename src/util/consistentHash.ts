import { createHash } from 'crypto'
import { MailStation } from '../client/mailstation'

interface Options {
    replicas?: number
    algorithm?: string
    station: MailStation
}
export class ConsistentHash {
    opts: Options
    station: MailStation
    replicas: number
    algorithm: string

    ring: { [ids: string]: string } = {}
    keys: string[] = []
    nodes: string[] = []
    constructor(nodes: string[], opts: Options) {
        this.opts = opts || {}

        this.replicas = this.opts.replicas || 100
        this.algorithm = this.opts.algorithm || 'md5'
        this.station = this.opts.station

        for (let i = 0; i < nodes.length; i++) {
            this.addNode(nodes[i])
        }

        this.station.on('addServer', this.addNode.bind(this))
        this.station.on('removeServer', this.removeNode.bind(this))
    }

    addNode(node: string) {
        this.nodes.push(node)
        for (let i = 0; i < this.replicas; i++) {
            const key = hash(this.algorithm, node + ':' + i)
            this.keys.push(key)
            this.ring[key] = node
        }
        this.keys.sort()
    }

    removeNode(node: string) {
        for (let i = 0; i < this.nodes.length; i++) {
            if (this.nodes[i] === node) {
                this.nodes.splice(i, 1)
                i--
            }
        }

        for (let j = 0; j < this.replicas; j++) {
            const key = hash(this.algorithm, node + ':' + j)
            delete this.ring[key]
            for (var k = 0; k < this.keys.length; k++) {
                if (this.keys[k] === key) {
                    this.keys.splice(k, 1)
                    k--
                }
            }
        }
    }

    getNode(key: string) {
        if (getKeysLength(this.ring) === 0) {
            return
        }
        const result = hash(this.algorithm, key)
        const pos = this.getNodePosition(result)
        return this.ring[this.keys[pos]]
    }

    getNodePosition(result: string) {
        let upper = getKeysLength(this.ring) - 1,
            lower = 0,
            idx = 0,
            comp = 0

        if (upper === 0) {
            return 0
        }

        //binary search
        while (lower <= upper) {
            idx = Math.floor((lower + upper) / 2)
            comp = compare(this.keys[idx], result)

            if (comp === 0) {
                return idx
            } else if (comp > 0) {
                upper = idx - 1
            } else {
                lower = idx + 1
            }
        }

        if (upper < 0) {
            upper = getKeysLength(this.ring) - 1
        }

        return upper
    }
}
function getKeysLength(map: any) {
    return Object.keys(map).length
}

function hash(algorithm: string, str: string) {
    return createHash(algorithm).update(str).digest('hex')
}

function compare(v1: any, v2: any) {
    return v1 > v2 ? 1 : v1 < v2 ? -1 : 0
}
