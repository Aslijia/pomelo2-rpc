export function invokeCallback(cb: Function, ...args: any[]) {
    if (typeof cb === 'function') {
        cb(...args)
    }
}

export function applyCallback(cb: Function, args: object) {
    if (typeof cb === 'function') {
        cb.apply(null, args)
    }
}

export function getObjectClass(obj: any) {
    if (!obj) {
        return
    }

    const constructor = obj.constructor
    if (!constructor) {
        return
    }

    if (constructor.name) {
        return constructor.name
    }

    const str = constructor.toString()
    if (!str) {
        return
    }

    let arr = null
    if (str.charAt(0) == '[') {
        arr = str.match(/\[\w+\s*(\w+)\]/)
    } else {
        arr = str.match(/function\s*(\w+)/)
    }

    if (arr && arr.length == 2) {
        return arr[1]
    }
}

/**
 * Utils check float
 *
 * @param  {Float}   float
 * @return {Boolean} true|false
 * @api public
 */
export function checkFloat(v: number) {
    return v === Number(v) && v % 1 !== 0
    // return parseInt(v) !== v;
}

/**
 * Utils check type
 *
 * @param  {String}   type
 * @return {Function} high order function
 * @api public
 */
export function isType(type: string) {
    return function (obj: object) {
        return {}.toString.call(obj) == '[object ' + type + ']'
    }
}

/**
 * Utils check array
 *
 * @param  {Array}   array
 * @return {Boolean} true|false
 * @api public
 */
export const checkArray = Array.isArray || isType('Array')

/**
 * Utils check number
 *
 * @param  {Number}  number
 * @return {Boolean} true|false
 * @api public
 */
export const checkNumber = isType('Number')

/**
 * Utils check function
 *
 * @param  {Function}   func function
 * @return {Boolean}    true|false
 * @api public
 */
export const checkFunction = isType('Function')
/**
 * Utils check object
 *
 * @param  {Object}   obj object
 * @return {Boolean}  true|false
 * @api public
 */
export const checkObject = isType('Object')

/**
 * Utils check string
 *
 * @param  {String}   string
 * @return {Boolean}  true|false
 * @api public
 */
export const checkString = isType('String')

/**
 * Utils check boolean
 *
 * @param  {Object}   obj object
 * @return {Boolean}  true|false
 * @api public
 */
export const checkBoolean = isType('Boolean')

/**
 * Utils check bean
 *
 * @param  {Object}   obj object
 * @return {Boolean}  true|false
 * @api public
 */
export function checkBean(obj: any) {
    return obj && obj['$id'] && checkFunction(obj['writeFields']) && checkFunction(obj['readFields'])
}

export function checkNull(obj: any) {
    return !isNotNull(obj)
}

/**
 * Utils args to array
 *
 * @param  {Object}  args arguments
 * @return {Array}   array
 * @api public
 */
export function to_array(args: any[]) {
    const len = args.length
    const arr = new Array(len)

    for (let i = 0; i < len; i++) {
        arr[i] = args[i]
    }

    return arr
}

/**
 * Utils check is not null
 *
 * @param  {Object}   value
 * @return {Boolean}  true|false
 * @api public
 */
export function isNotNull(value: any) {
    if (value !== null && typeof value !== 'undefined') return true
    return false
}

export function getType(object: any) {
    if (object == null || typeof object === 'undefined') {
        return typeMap['null']
    }

    if (Buffer.isBuffer(object)) {
        return typeMap['buffer']
    }

    if (checkArray(object)) {
        return typeMap['array']
    }

    if (checkString(object)) {
        return typeMap['string']
    }

    if (checkObject(object)) {
        if (checkBean(object)) {
            return typeMap['bean']
        }

        return typeMap['object']
    }

    if (checkBoolean(object)) {
        return typeMap['boolean']
    }

    if (checkNumber(object)) {
        if (checkFloat(object)) {
            return typeMap['float']
        }

        if (isNaN(object)) {
            return typeMap['null']
        }

        return typeMap['number']
    }
}

export const typeArray = ['', 'null', 'buffer', 'array', 'string', 'object', 'bean', 'boolean', 'float', 'number']
export const typeMap: { [ids: string]: number } = {}
for (var i = 1; i <= typeArray.length; i++) {
    typeMap[typeArray[i]] = i
}

export function getBearcat() {
    return require('bearcat')
}

export function genServicesMap(services: any) {
    const nMap: { [ids: string]: number } = {}, // namespace
        sMap: { [ids: string]: number } = {}, // service
        mMap: { [ids: string]: number } = {}, // method
        nList = [],
        sList = [],
        mList = []

    let nIndex = 0,
        sIndex = 0,
        mIndex = 0

    for (let namespace in services) {
        nList.push(namespace)
        nMap[namespace] = nIndex++
        const s = services[namespace]

        for (let service in s) {
            sList.push(service)
            sMap[service] = sIndex++
            const m = s[service]

            for (let method in m) {
                const func = m[method]
                if (checkFunction(func)) {
                    mList.push(method)
                    mMap[method] = mIndex++
                }
            }
        }
    }

    return [nMap, sMap, mMap, nList, sList, mList]
}
