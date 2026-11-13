// Capture native getters: public .buffer/.byteLength properties can be shadowed
// without changing which storage structured clone copies or transfers.
const typedBuffer = nativeGetter(Object.getPrototypeOf(Uint8Array.prototype), 'buffer');
const dataBuffer = nativeGetter(DataView.prototype, 'buffer');
const arrayLength = nativeGetter(ArrayBuffer.prototype, 'byteLength');
const sharedConstructor = typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : null;
const sharedLength = sharedConstructor ? nativeGetter(sharedConstructor.prototype, 'byteLength') : null;

function nativeGetter(prototype, name) {
    const getter=Object.getOwnPropertyDescriptor(prototype,name)?.get;
    if(!getter)throw new TypeError('Required native buffer accessor is unavailable');
    return getter;
}

/** @param {ArrayBufferView<ArrayBufferLike>} view @returns {ArrayBufferLike} */
export function viewStorage(view) {
    if (view instanceof DataView) return dataBuffer.call(view);
    try { return typedBuffer.call(view); }
    catch { return dataBuffer.call(view); } // Cross-realm DataView.
}

/** @param {ArrayBufferLike} buffer @returns {number} Actual in-memory storage. */
export function storageLength(buffer) {
    if (sharedConstructor && sharedLength && buffer instanceof sharedConstructor) return sharedLength.call(buffer);
    try { return arrayLength.call(buffer); }
    catch (error) {
        if (sharedLength) return sharedLength.call(buffer); // Cross-realm shared storage.
        throw error;
    }
}
