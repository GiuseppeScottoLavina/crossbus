/**
 * Hub-Spoke Pattern Example
 * 
 * Demonstrates the central orchestrator pattern where a hub
 * coordinates communication between multiple agents.
 * 
 * Architecture:
 *                     ┌─────────────┐
 *                     │     HUB     │
 *                     │ (orchestrator)
 *                     └──────┬──────┘
 *            ┌───────────────┼───────────────┐
 *            │               │               │
 *     ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
 *     │  AGENT-1    │ │  AGENT-2    │ │  AGENT-3    │
 *     └─────────────┘ └─────────────┘ └─────────────┘
 */

import { CrossBus } from 'crossbus';
const { PostMessageTransport } = await import('crossbus');

// Exact origins of the page hosting the hub and of the agent iframes.
// Replace them with your deployment's origins; wildcards are rejected by createSecure().
const HUB_ORIGIN = 'https://app.example.com';
const AGENT_ORIGIN = 'https://agents.example.com';

// ============================================
// HUB SETUP (main page / orchestrator)
// ============================================

const hub = CrossBus.createSecure({
    isHub: true, // Reported by diagnostics; routing still requires explicit transports.
    peerId: 'hub',
    allowedOrigins: [AGENT_ORIGIN],
});

// Register handlers for agent requests
hub.handle('getData', async (payload) => {
    console.log('[Hub] getData request received:', payload);
    // Simulate database lookup
    return {
        data: {
            id: payload.id,
            name: `Item ${payload.id}`,
            timestamp: Date.now(),
        },
    };
});

hub.handle('processTask', async (payload) => {
    console.log('[Hub] processTask request received:', payload);
    // Simulate task processing
    return {
        taskId: payload.taskId,
        status: 'completed',
        result: payload.input.toUpperCase(),
    };
});

// Listen for agent lifecycle events
hub.on('agent:ready', (event) => {
    console.log(`[Hub] Agent ready: ${event.data.payload.agentId}`);
});

hub.on('agent:error', (event) => {
    console.error(`[Hub] Agent error: ${event.data.payload.agentId}`, event.data.payload.error);
});

// ============================================
// AGENT SETUP (in iframe or worker)
// ============================================

function createAgent(agentId) {
    const agent = CrossBus.createSecure({
        peerId: agentId,
        allowedOrigins: [HUB_ORIGIN],
    });

    // Connect to parent (hub)
    agent.addTransport(
        new PostMessageTransport(window.parent, {
            targetOrigin: HUB_ORIGIN,
            allowedOrigins: [HUB_ORIGIN],
        }),
        { peerId: 'hub' }
    );

    // Handler the hub calls via hub.request(agentId, 'process', payload)
    agent.handle('process', async (payload) => {
        return { agentId, processed: payload.data };
    });

    // Announce ourselves to the hub
    agent.signal('agent:ready', { agentId });

    // Return agent interface
    return {
        peerId: agentId,

        async getData(id) {
            return agent.request('hub', 'getData', { id });
        },

        async processTask(taskId, input) {
            return agent.request('hub', 'processTask', { taskId, input });
        },

        broadcast(eventName, data) {
            agent.signal(eventName, { agentId, ...data });
        },

        destroy() {
            agent.destroy();
        },
    };
}

// ============================================
// CONNECTING AGENTS (from hub side)
// ============================================

function connectAgentIframe(iframeElement, agentId, src) {
    return new Promise((resolve, reject) => {
        // Install the transport and ready listener before navigating the iframe,
        // so the agent's agent:ready signal cannot arrive before the hub listens.
        const removeTransport = hub.addTransport(
            new PostMessageTransport(iframeElement.contentWindow, {
                targetOrigin: AGENT_ORIGIN,
                allowedOrigins: [AGENT_ORIGIN],
            }),
            { peerId: agentId }
        );

        const subscription = hub.on('agent:ready', (event) => {
            if (event.data.payload.agentId === agentId) {
                clearTimeout(timeout);
                subscription.unsubscribe();
                resolve(agentId);
            }
        });

        const timeout = setTimeout(() => {
            subscription.unsubscribe();
            removeTransport();
            reject(new Error(`Agent ${agentId} connection timeout`));
        }, 10000);

        iframeElement.src = src;
    });
}

// ============================================
// USAGE EXAMPLE
// ============================================

async function main() {
    // Create iframes for agents (in real app)
    const agentIframes = [
        { id: 'agent-1', src: '/agents/worker-agent.html' },
        { id: 'agent-2', src: '/agents/ui-agent.html' },
        { id: 'agent-3', src: '/agents/data-agent.html' },
    ];

    // Connect all agents
    for (const { id, src } of agentIframes) {
        const iframe = document.createElement('iframe');
        iframe.id = id;
        iframe.style.display = 'none';
        document.body.appendChild(iframe); // contentWindow exists before navigation

        try {
            await connectAgentIframe(iframe, id, src);
            console.log(`✅ Agent ${id} connected`);
        } catch (error) {
            console.error(`❌ Agent ${id} failed:`, error);
        }
    }

    // Now hub can communicate with all agents
    const result = await hub.request('agent-1', 'process', { data: 'hello' });
    console.log('Result from agent-1:', result);

    // Broadcast to all agents
    hub.signal('config:update', { theme: 'dark' });
}

// Export for testing
export { hub, createAgent, connectAgentIframe };
