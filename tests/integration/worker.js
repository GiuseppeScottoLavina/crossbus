/**
 * @fileoverview Test worker for CrossBus communication.
 * This worker acts as a CrossBus peer that can handle requests.
 */

const handlers = {
    getStatus: () => ({
        status: 'worker-healthy',
        workerId: 'test-worker',
        timestamp: Date.now()
    }),

    echo: (payload) => ({
        echo: payload,
        from: 'worker'
    }),

    compute: (payload) => ({
        result: payload.a + payload.b,
        computed: true
    })
};

// Listen for messages from main thread
self.onmessage = async (event) => {
    const { data } = event;

    // Registration confirmation
    if (data && data.__crossbus_registered) {
        // console.log('[Worker] Registered with hub');
        return;
    }

    // Normalization logic: Legacy envelope (msg.t='env') vs SOTA (data.type='request')

    // Check Legacy
    let isLegacy = false;
    let message = data;

    if (data && data.t === 'env') {
        isLegacy = true;
        message = data.p; // Payload inside envelope
    }
    // Check SOTA protocol (if top level has type)
    else if (data && (data.type || data.t)) {
        message = data;
    }

    if (!message) return;

    // Normalize type and id
    const type = message.type || message.t;
    const id = message.id || data.id; // ID might be on envelope or message

    if (!type) {
        // console.log('[Worker] Unknown message type', data);
        return;
    }

    // Handle signals
    if (type === 'sig' || type === 'signal') {
        const name = message.name || message.payload?.name;
        // console.log(`[Worker] Signal received: ${name}`);
        // Optional ACK for tests if needed (not standard signal behavior but useful for test correlation)
        return;
    }

    // Handle requests
    if (type === 'req' || type === 'request') {
        const handlerName = message.handler || message.payload?.name;

        // Extract data: Legacy p or SOTA payload.data
        const reqData = message.payload?.data ?? message.p;

        const handler = handlers[handlerName];

        let response;
        if (handler) {
            try {
                const result = handler(reqData);
                // Reply using SOTA or Legacy depending on input? 
                // Test page now handles SOTA response structure.
                response = {
                    type: 'res',
                    id: id,
                    success: true,
                    payload: { data: result }
                    // Legacy fields for backward compat if needed by old tests (but we updated test page)
                    // t: 'res', data: result 
                };
                // console.log(`[Worker] ${handlerName}() -> OK`);
            } catch (error) {
                response = {
                    type: 'res',
                    id: id,
                    success: false,
                    error: { message: error.message }
                };
            }
        } else {
            response = {
                type: 'res',
                id: id,
                success: false,
                error: { message: 'Handler not found' }
            };
        }

        self.postMessage(response);
    }
};

// Register with main thread
self.postMessage({
    __crossbus_register: true,
    peerId: 'test-worker',
    meta: {
        type: 'worker',
        version: '1.0'
    }
});

// console.log('[Worker] Started and registered');
