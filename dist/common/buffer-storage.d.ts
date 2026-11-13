/** @param {ArrayBufferView<ArrayBufferLike>} view @returns {ArrayBufferLike} */
export function viewStorage(view: ArrayBufferView<ArrayBufferLike>): ArrayBufferLike;
/** @param {ArrayBufferLike} buffer @returns {number} Actual in-memory storage. */
export function storageLength(buffer: ArrayBufferLike): number;
