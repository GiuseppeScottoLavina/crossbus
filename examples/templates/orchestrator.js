/**
 * Orchestrator Template
 * 
 * Template for creating a central orchestrator that coordinates
 * multiple agents and routes tool calls.
 * 
 * Agents are identified by the peer bound to their transport, never by an ID
 * in a message payload. Announced capabilities and tool lists are self-declared
 * by that bound peer; authorize what each agent may do in your application.
 *
 * @example
 * const orchestrator = new Orchestrator({ allowedOrigins: ['https://agents.example.com'] });
 * const iframe = document.body.appendChild(document.createElement('iframe'));
 * await orchestrator.connectAgent('planner', iframe, {
 *   origin: 'https://agents.example.com',
 *   src: 'https://agents.example.com/planner.html',
 * });
 * const result = await orchestrator.delegate('planner', 'plan', { goal: 'Build app' });
 */

import { CrossBus } from 'crossbus';
const { PostMessageTransport, MessageChannelTransport } = await import('crossbus');

export class Orchestrator {
    #bus;
    #agents = new Map();
    #toolIndex = new Map(); // tool -> agentId

    /**
     * Create an Orchestrator
     * @param {Object} options - Configuration options
     * @param {string[]} options.allowedOrigins - Exact agent origins. Include
     *   'channel' when connecting Workers with connectWorker().
     */
    constructor(options = {}) {
        // createSecure() requires explicit origins and rejects wildcards.
        this.#bus = CrossBus.createSecure({
            isHub: true,
            peerId: options.peerId || 'orchestrator',
            allowedOrigins: options.allowedOrigins,
            capabilities: ['orchestrator', 'tool:router'],
            meta: {
                type: 'orchestrator',
                version: options.version || '1.0.0',
            },
        });

        this.#setupEventHandlers();
        this.#setupRPCHandlers();
    }

    /**
     * Setup event handlers for agent lifecycle
     */
    #setupEventHandlers() {
        // Agent announcements
        this.#bus.on('agent:ready', (event) => {
            // event.data.source is the peer ID bound to the receiving transport.
            const { capabilities, meta } = event.data.payload ?? {};
            this.#registerAgent(event.data.source, { capabilities, meta, status: 'ready' });
        });

        // Agent status updates
        this.#bus.on('agent:thinking', (event) => {
            const agent = this.#agents.get(event.data.payload.agentId);
            if (agent) agent.status = 'thinking';
        });

        this.#bus.on('agent:response', (event) => {
            const agent = this.#agents.get(event.data.payload.agentId);
            if (agent) agent.status = 'ready';
        });

        this.#bus.on('agent:error', (event) => {
            const agent = this.#agents.get(event.data.payload.agentId);
            if (agent) {
                agent.status = 'error';
                agent.lastError = event.data.payload.error;
            }
        });
    }

    /**
     * Setup RPC handlers
     */
    #setupRPCHandlers() {
        // Route tool calls to appropriate agent
        this.#bus.handle('tool:call', async (payload) => {
            const { tool, params, timeout } = payload;
            return this.#routeToolCall(tool, params, timeout);
        });

        // List all available tools
        this.#bus.handle('tools:list', async () => {
            return this.#getAllTools();
        });

        // List connected agents
        this.#bus.handle('agents:list', async () => {
            return {
                agents: Array.from(this.#agents.entries()).map(([id, info]) => ({
                    id,
                    ...info,
                })),
            };
        });

        // Health check all agents
        this.#bus.handle('health', async () => {
            return this.#healthCheck();
        });
    }

    /**
     * Register an agent
     */
    #registerAgent(agentId, info) {
        this.#agents.set(agentId, {
            ...info,
            connectedAt: Date.now(),
        });

        // Index tools from this agent
        if (info.meta?.tools) {
            for (const tool of info.meta.tools) {
                this.#toolIndex.set(tool, agentId);
            }
        }

        console.log(`[Orchestrator] Agent registered: ${agentId}`, info);
    }

    /**
     * Connect an agent running in an iframe.
     *
     * The iframe must already be in the document. The transport and ready
     * listener are installed before `src` is navigated, so the agent's
     * agent:ready announcement cannot be missed.
     *
     * @param {string} agentId - Peer ID to bind to this iframe.
     * @param {HTMLIFrameElement} iframe - Iframe element in the document.
     * @param {Object} options
     * @param {string} options.origin - The agent's exact origin.
     * @param {string} [options.src] - URL to navigate after the transport is ready.
     * @param {number} [options.timeout=10000] - Ready timeout in milliseconds.
     * @returns {Promise<string>} Resolves with agentId once the agent is ready.
     */
    async connectAgent(agentId, iframe, options = {}) {
        if (!options.origin || options.origin.includes('*')) {
            throw new Error('connectAgent() requires the agent\'s exact origin');
        }
        if (!iframe.contentWindow) {
            throw new Error('Append the iframe to the document before connectAgent()');
        }

        const removeTransport = this.#bus.addTransport(
            new PostMessageTransport(iframe.contentWindow, {
                targetOrigin: options.origin,
                allowedOrigins: [options.origin],
            }),
            { peerId: agentId }
        );

        return new Promise((resolve, reject) => {
            const subscription = this.#bus.on('agent:ready', (event) => {
                if (event.data.source === agentId) {
                    clearTimeout(timeout);
                    subscription.unsubscribe();
                    resolve(agentId);
                }
            });

            const timeout = setTimeout(() => {
                subscription.unsubscribe();
                removeTransport();
                reject(new Error(`Connection timeout for agent: ${agentId}`));
            }, options.timeout || 10000);

            if (options.src) iframe.src = options.src;
        });
    }

    /**
     * Connect an agent running in a module Worker over a dedicated MessageChannel.
     * The worker receives `{ port }` and connects with
     * `agent.connect(MessageChannelTransport.fromPort(port), { peerId: 'orchestrator', origin: 'channel' })`.
     * Requires 'channel' in the orchestrator's allowedOrigins.
     *
     * @param {string} agentId - Peer ID to bind to this worker.
     * @param {Worker} worker - Worker running an agent template.
     * @returns {Function} Cleanup that removes the transport.
     */
    connectWorker(agentId, worker) {
        const channel = new MessageChannelTransport();
        const removeTransport = this.#bus.addTransport(channel, { peerId: agentId, origin: 'channel' });
        worker.postMessage({ port: channel.remotePort }, [channel.remotePort]);
        channel.markRemoteTransferred();
        return removeTransport;
    }

    /**
     * Delegate task to an agent
     */
    async delegate(agentId, handler, data, options = {}) {
        const agent = this.#agents.get(agentId);
        if (!agent) {
            throw new Error(`Unknown agent: ${agentId}`);
        }

        return this.#bus.request(agentId, handler, data, {
            timeout: options.timeout || 30000,
        });
    }

    /**
     * Broadcast to all agents with a capability
     */
    async broadcastToCapability(capability, handler, data) {
        const targetAgents = Array.from(this.#agents.entries())
            .filter(([_, info]) => info.capabilities?.includes(capability))
            .map(([id]) => id);

        const results = await Promise.allSettled(
            targetAgents.map((id) => this.#bus.request(id, handler, data))
        );

        return results.map((r, i) => ({
            agentId: targetAgents[i],
            status: r.status,
            value: r.status === 'fulfilled' ? r.value : undefined,
            error: r.status === 'rejected' ? r.reason?.message : undefined,
        }));
    }

    /**
     * Route tool call to appropriate agent
     */
    async #routeToolCall(tool, params, timeout = 30000) {
        const agentId = this.#toolIndex.get(tool);
        if (!agentId) {
            throw new Error(`No agent provides tool: ${tool}`);
        }

        return this.#bus.request(agentId, 'execute', { tool, params }, { timeout });
    }

    /**
     * Get all tools from all agents
     */
    async #getAllTools() {
        const toolAgents = Array.from(this.#agents.entries()).filter(
            ([_, info]) => info.meta?.type === 'tool'
        );

        const allTools = [];
        for (const [agentId] of toolAgents) {
            try {
                const { tools } = await this.#bus.request(agentId, 'describe', {});
                allTools.push(
                    ...tools.map((t) => ({
                        ...t,
                        providedBy: agentId,
                    }))
                );
            } catch (error) {
                console.warn(`Failed to get tools from ${agentId}:`, error);
            }
        }

        return { tools: allTools };
    }

    /**
     * Health check all agents
     */
    async #healthCheck() {
        const results = await Promise.allSettled(
            Array.from(this.#agents.keys()).map(async (agentId) => {
                const start = Date.now();
                await this.#bus.request(agentId, 'ping', {}, { timeout: 5000 });
                return { agentId, status: 'healthy', latency: Date.now() - start };
            })
        );

        const agentHealth = results.map((r, i) => {
            const agentId = Array.from(this.#agents.keys())[i];
            return r.status === 'fulfilled'
                ? r.value
                : { agentId, status: 'unhealthy', error: r.reason?.message };
        });

        return {
            status: agentHealth.every((a) => a.status === 'healthy') ? 'healthy' : 'degraded',
            agents: agentHealth,
            timestamp: Date.now(),
        };
    }

    /**
     * Get the CrossBus instance
     */
    getBus() {
        return this.#bus;
    }

    /**
     * Cleanup and destroy
     */
    destroy() {
        this.#bus.destroy();
    }
}

// ============================================
// USAGE EXAMPLE
// ============================================

/*
const AGENT_ORIGIN = 'https://agents.example.com';

// Create orchestrator
const orchestrator = new Orchestrator({ allowedOrigins: [AGENT_ORIGIN] });

// Connect agents: iframes are in the document but not yet navigated
const plannerIframe = document.getElementById('planner-agent');
const executorIframe = document.getElementById('executor-agent');

await Promise.all([
  orchestrator.connectAgent('planner', plannerIframe, { origin: AGENT_ORIGIN, src: `${AGENT_ORIGIN}/planner.html` }),
  orchestrator.connectAgent('executor', executorIframe, { origin: AGENT_ORIGIN, src: `${AGENT_ORIGIN}/executor.html` }),
]);

console.log('All agents connected!');

// Delegate tasks
const plan = await orchestrator.delegate('planner', 'infer', {
  messages: [{ role: 'user', content: 'Create a plan to build a todo app' }],
});

console.log('Plan:', plan);

// Route tool calls
const calcResult = await orchestrator.delegate('orchestrator', 'tool:call', {
  tool: 'add',
  params: { a: 5, b: 3 },
});

console.log('Calculation result:', calcResult);
*/

export default Orchestrator;
