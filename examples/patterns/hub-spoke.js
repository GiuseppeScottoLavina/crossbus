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

import { CrossBus, PostMessageTransport } from 'crossbus';

// ============================================
// HUB SETUP (main page / orchestrator)
// ============================================

const hub = new CrossBus({
    isHub: true,
    peerId: 'hub',
    allowedOrigins: ['*'], // Use specific origins in production
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
    console.log(`[Hub] Agent ready: ${event.data.agentId}`);
});

hub.on('agent:error', (event) => {
    console.error(`[Hub] Agent error: ${event.data.agentId}`, event.data.error);
});

// ============================================
// AGENT SETUP (in iframe or worker)
// ============================================

function createAgent(agentId) {
    const agent = new CrossBus({
        peerId: agentId,
        allowedOrigins: ['*'],
    });

    // Connect to parent (hub)
    agent.addTransport(
        new PostMessageTransport(window.parent, { targetOrigin: '*' }),
        { peerId: 'hub' }
    );

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

function connectAgentIframe(iframeElement, agentId) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Agent ${agentId} connection timeout`));
        }, 10000);

        iframeElement.onload = () => {
            // Add transport for this agent
            hub.addTransport(
                new PostMessageTransport(iframeElement.contentWindow, { targetOrigin: '*' }),
                { peerId: agentId }
            );

            // Wait for agent:ready signal
            const unsubscribe = hub.on('agent:ready', (event) => {
                if (event.data.agentId === agentId) {
                    clearTimeout(timeout);
                    unsubscribe();
                    resolve(agentId);
                }
            });
        };

        iframeElement.onerror = (error) => {
            clearTimeout(timeout);
            reject(error);
        };
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
        iframe.src = src;
        iframe.id = id;
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        try {
            await connectAgentIframe(iframe, id);
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
