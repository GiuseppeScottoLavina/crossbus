/** Optional MessageChannel encoding; public bus messages retain protocol v1 objects. */
import { MessageType, EMPTY_MESSAGE_META } from './types.js';
const TAG = 'crossbus:compact:1';
// This tag specifically carries protocol v1, independently of future defaults.
const WIRE_PROTOCOL_VERSION = 1;
const ENVELOPE = ['_cb','version','id','type','timestamp','payload','meta'];
const CALL = ['name','data','source','dest'];
const REPLY = ['requestId','data','source','success','error'];
function exactFields(value, names) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    if (keys.length !== names.length) return false;
    // Builders create fields in this order; validate it in linear comparisons.
    // Reordered/custom records still use the full set check before encoding.
    for (let i = 0; i < names.length; i++) {
        if (keys[i] !== names[i]) {
            for (const key of keys) if (!names.includes(key)) return false;
            break;
        }
    }
    return true;
}
/**
 * Encode only the standard envelope shapes. Extension fields, custom metadata,
 * other versions/types and nonstandard messages retain their original object.
 * @param {any} message
 * @returns {any}
 */
export function encodeCompact(message) {
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
        return [TAG,type,id,timestamp,name,data,source,dest];
    }
    if (type === MessageType.RESPONSE) {
        if (!exactFields(p,REPLY)) return message;
        const { requestId, data, source, success, error } = p;
        if (typeof requestId !== 'string' || typeof source !== 'string' || typeof success !== 'boolean') return message;
        return [TAG,type,id,timestamp,requestId,data,source,success,error];
    }
    return message;
}
/** @param {any} packet @returns {any} Null means a malformed compact packet. */
export function decodeCompact(packet) {
    if (!Array.isArray(packet) || packet[0] !== TAG) return packet;
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
