/**
 * Orchestrator Template
 * 
 * Template for creating a central orchestrator that coordinates
 * multiple agents and routes tool calls.
 * 
 * @example
 * const orchestrator = new Orchestrator();
 * await orchestrator.connectAgent('planner', iframe);
 * const result = await orchestrator.delegate('planner', 'plan', { goal: 'Build app' });
 */

import { CrossBus, PostMessageTransport } from 'crossbus';

export class Orchestrator {
    #bus;
    #agents = new Map();
    #toolIndex = new Map(); // tool -> agentId

    /**
     * Create an Orchestrator
     * @param {Object} [options] - Configuration options
     */
    constructor(options = {}) {
        this.#bus = new CrossBus({
            isHub: true,
            peerId: options.peerId || 'orchestrator',
            allowedOrigins: options.allowedOrigins || ['*'],
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
            const { agentId, capabilities, meta } = event.data;
            this.#registerAgent(agentId, { capabilities, meta, status: 'ready' });
        });

        // Agent status updates
        this.#bus.on('agent:thinking', (event) => {
            const agent = this.#agents.get(event.data.agentId);
            if (agent) agent.status = 'thinking';
        });

        this.#bus.on('agent:response', (event) => {
            const agent = this.#agents.get(event.data.agentId);
            if (agent) agent.status = 'ready';
        });

        this.#bus.on('agent:error', (event) => {
            const agent = this.#agents.get(event.data.agentId);
            if (agent) {
                agent.status = 'error';
                agent.lastError = event.data.error;
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
     * Connect an agent via iframe
     */
    async connectAgent(agentId, iframe, options = {}) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Connection timeout for agent: ${agentId}`));
            }, options.timeout || 10000);

            const handleReady = (event) => {
                if (event.data.agentId === agentId) {
                    clearTimeout(timeout);
                    this.#bus.off('agent:ready', handleReady);
                    resolve(agentId);
                }
            };

            this.#bus.on('agent:ready', handleReady);

            // Add transport when iframe loads
            if (iframe.contentWindow) {
                this.#bus.addTransport(
                    new PostMessageTransport(iframe.contentWindow, {
                        targetOrigin: options.targetOrigin || '*',
                    }),
                    { peerId: agentId }
                );
            } else {
                iframe.onload = () => {
                    this.#bus.addTransport(
                        new PostMessageTransport(iframe.contentWindow, {
                            targetOrigin: options.targetOrigin || '*',
                        }),
                        { peerId: agentId }
                    );
                };
            }
        });
    }

    /**
     * Connect an agent via worker
     */
    connectWorker(agentId, worker) {
        this.#bus.addTransport(new PostMessageTransport(worker), { peerId: agentId });
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
// Create orchestrator
const orchestrator = new Orchestrator();

// Connect agents
const plannerIframe = document.getElementById('planner-agent');
const executorIframe = document.getElementById('executor-agent');

await Promise.all([
  orchestrator.connectAgent('planner', plannerIframe),
  orchestrator.connectAgent('executor', executorIframe),
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
