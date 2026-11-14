// Internal flow-control state. Credits acknowledge chunks pulled by the reader.
export const FLOW_VERSION = 1;

export function streamFailure(message, code = 'ERR_STREAM_CANCELLED') {
    return Object.assign(new Error(message), { code });
}

export function positiveInteger(value, name, allowZero = false) {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1))
        throw new RangeError(
            `${name} must be a ${allowZero ? 'nonnegative' : 'positive'} safe integer`
        );
    return value;
}

/** A single waiter/timer per writer, with cumulative acknowledgements. */
export class StreamWindow {
    #ready = false;
    #started = false;
    #closing = false;
    #remoteEnded = false;
    #sent = 0;
    #acked = 0;
    #window;
    #timeout;
    /** @type {Error|null} */
    #error = null;
    /** @type {{resolve:Function,reject:Function,timer:ReturnType<typeof setTimeout>|null}|null} */
    #waiter = null;

    constructor(windowSize, timeout) {
        this.#window = positiveInteger(windowSize, 'windowSize');
        this.#timeout = positiveInteger(timeout, 'ackTimeout', true);
    }

    start() {
        this.#started = true;
    }
    close() {
        this.#closing = true;
    }
    sent() {
        this.#sent++;
    }
    get hasCredit() {
        return !this.#error && this.#ready && this.#sent - this.#acked < this.#window;
    }

    acknowledge(message) {
        if (
            !this.#started ||
            this.#error ||
            message.flow !== FLOW_VERSION ||
            !Number.isSafeInteger(message.seq) ||
            message.seq < 0 ||
            message.seq > this.#sent
        )
            return;
        let progress = false;
        if (message.ready === true && message.seq === 0 && !this.#ready) {
            this.#ready = true;
            progress = true;
        }
        if (!this.#ready) return;
        if (message.seq > this.#acked) {
            this.#acked = message.seq;
            progress = true;
        }
        if (
            message.ended === true &&
            this.#closing &&
            message.seq === this.#sent &&
            !this.#remoteEnded
        ) {
            this.#remoteEnded = true;
            progress = true;
        }
        if (progress && this.#waiter) {
            const waiter = this.#waiter;
            this.#waiter = null;
            if (waiter.timer) clearTimeout(waiter.timer);
            waiter.resolve();
        }
    }

    fail(error) {
        if (this.#error) return;
        this.#error = error instanceof Error ? error : new Error(String(error));
        const waiter = this.#waiter;
        this.#waiter = null;
        if (waiter) {
            if (waiter.timer) clearTimeout(waiter.timer);
            waiter.reject(this.#error);
        }
    }

    async ready() {
        while (!this.#ready) await this.#wait();
        this.#check();
    }
    async credit() {
        this.#check();
        while (this.#sent - this.#acked >= this.#window) await this.#wait();
        this.#check();
    }
    async ended() {
        while (!this.#remoteEnded) await this.#wait();
        this.#check();
    }
    #check() {
        if (this.#error) throw this.#error;
    }

    #wait() {
        this.#check();
        return new Promise((resolve, reject) => {
            const waiter = {
                resolve,
                reject,
                timer: /** @type {ReturnType<typeof setTimeout>|null} */ (null)
            };
            this.#waiter = waiter;
            if (this.#timeout)
                waiter.timer = setTimeout(() => {
                    this.fail(
                        streamFailure('Stream acknowledgement timed out', 'ERR_STREAM_TIMEOUT')
                    );
                }, this.#timeout);
        });
    }
}
