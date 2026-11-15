/** Optional MessageChannel encoding; public bus messages retain protocol v1 objects. */
import { MessageType, EMPTY_MESSAGE_META } from './types.js';
const TAG = 'crossbus:compact:1';
// Separate opt-in wire version. Numeric tags combine branding and message kind.
const V2_REQUEST = 0x0cb20001;
const V2_SIGNAL = 0x0cb20002;
const V2_RESPONSE = 0x0cb20003;
const V2_SUCCESS = 0x0cb20004;
// This tag specifically carries protocol v1, independently of future defaults.
const WIRE_PROTOCOL_VERSION = 1;
const ENVELOPE = ['_cb','version','id','type','timestamp','payload','meta'];
const CALL = ['name','data','source','dest'];
const REPLY = ['requestId','data','source','success','error'];
function exactFields(value, names) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    if (keys.length !== names.length) return false;
    for (const key of keys) if (!names.includes(key)) return false;
    return true;
}
/**
 * Encode only the standard envelope shapes. Extension fields, custom metadata,
 * other versions/types and nonstandard messages retain their original object.
 * @param {any} message
 * @param {boolean} [version2=false]
 * @returns {any}
 */
export function encodeCompact(message, version2 = false) {
    if (!exactFields(message, ENVELOPE)) return message;
    const { _cb, version, id, type, timestamp, payload:p, meta } = message;
    if (_cb !== WIRE_PROTOCOL_VERSION || version !== WIRE_PROTOCOL_VERSION || typeof id !== 'string' || typeof timestamp !== 'number') return message;
    if (meta !== EMPTY_MESSAGE_META) {
        if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return message;
        const prototype = Object.getPrototypeOf(meta);
        if ((prototype !== null && prototype !== Object.prototype) || Object.keys(meta).length !== 0) return message;
    }
    if (type === MessageType.REQUEST || type === MessageType.SIGNAL) {
        if (!exactFields(p,CALL)) return message;
        const { name, data, source, dest } = p;
        if (typeof name !== 'string' || typeof source !== 'string' || (dest !== null && typeof dest !== 'string')) return message;
        return version2
            ? [type === MessageType.REQUEST ? V2_REQUEST : V2_SIGNAL,id,timestamp,name,data,source,dest]
            : [TAG,type,id,timestamp,name,data,source,dest];
    }
    if (type === MessageType.RESPONSE) {
        if (!exactFields(p,REPLY)) return message;
        const { requestId, data, source, success, error } = p;
        if (typeof requestId !== 'string' || typeof source !== 'string' || typeof success !== 'boolean') return message;
        if (version2) return success && error === null
            ? [V2_SUCCESS,id,timestamp,requestId,data,source]
            : [V2_RESPONSE,id,timestamp,requestId,data,source,success,error];
        return [TAG,type,id,timestamp,requestId,data,source,success,error];
    }
    return message;
}
/** @param {any} packet @returns {any} Null means a malformed compact packet. */
export function decodeCompact(packet) {
    if (!Array.isArray(packet)) return packet;
    const tag = packet[0];
    if (tag !== TAG) return decodeVersion2(packet, tag);
    const [,type,id,timestamp,key,data,source] = packet;
    if (typeof id !== 'string' || typeof timestamp !== 'number' || typeof key !== 'string' || typeof source !== 'string') return null;
    let payload;
    if ((type === MessageType.REQUEST || type === MessageType.SIGNAL) && packet.length === 8) {
        if (packet[7] !== null && typeof packet[7] !== 'string') return null;
        payload = { name:key, data, source, dest:packet[7] };
    } else if (type === MessageType.RESPONSE && packet.length === 9 && typeof packet[7] === 'boolean') {
        payload = { requestId:key, data, source, success:packet[7], error:packet[8] };
    } else return null;
    return { _cb:WIRE_PROTOCOL_VERSION, version:WIRE_PROTOCOL_VERSION, id, type, timestamp, payload, meta:{} };
}

/** @param {any[]} packet @param {any} tag @returns {any} */
function decodeVersion2(packet, tag) {
    let type;
    switch (tag) {
        case V2_REQUEST: type = MessageType.REQUEST; break;
        case V2_SIGNAL: type = MessageType.SIGNAL; break;
        case V2_RESPONSE:
        case V2_SUCCESS: type = MessageType.RESPONSE; break;
        default: return packet;
    }
    const [,id,timestamp,key,data,source] = packet;
    if (typeof id !== 'string' || typeof timestamp !== 'number' || typeof key !== 'string' || typeof source !== 'string') return null;
    let payload;
    if (tag === V2_REQUEST || tag === V2_SIGNAL) {
        if (packet.length !== 7 || (packet[6] !== null && typeof packet[6] !== 'string')) return null;
        payload = { name:key, data, source, dest:packet[6] };
    } else if (tag === V2_SUCCESS) {
        if (packet.length !== 6) return null;
        payload = { requestId:key, data, source, success:true, error:null };
    } else {
        if (packet.length !== 8 || typeof packet[6] !== 'boolean') return null;
        payload = { requestId:key, data, source, success:packet[6], error:packet[7] };
    }
    return { _cb:WIRE_PROTOCOL_VERSION, version:WIRE_PROTOCOL_VERSION, id, type, timestamp, payload, meta:{} };
}
