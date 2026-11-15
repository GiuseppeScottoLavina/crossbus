/**
 * LLM Agent Template
 * 
 * Template for creating an LLM-powered agent that integrates with CrossBus.
 * The agent can receive inference requests and emit tool calls.
 * 
 * @example
 * const agent = new LLMAgent({
 *   agentId: 'planner',
 *   model: 'your-model-id',
 *   systemPrompt: 'You are a planning assistant...',
 *   llmClient: request => callYourBackend(request),
 *   allowedOrigins: ['https://app.example.com'],
 * });
 */

import { CrossBus } from 'crossbus';

export class LLMAgent {
    #bus;
    #config;
    #capabilities;
    #meta;
    #conversationHistory = [];

    /**
     * Create an LLM Agent
     * @param {Object} config - Agent configuration
     * @param {string} config.agentId - Unique identifier for this agent
     * @param {string} config.model - Model identifier passed to llmClient
     * @param {string} config.systemPrompt - System prompt for the LLM
     * @param {Function} config.llmClient - Function to call the LLM API
     * @param {string[]} [config.capabilities] - Agent capabilities
     * @param {string[]} config.allowedOrigins - Exact origin(s) of the hub, or 'channel' for a MessagePort.
     */
    constructor(config) {
        this.#config = config;
        this.#capabilities = ['agent:llm', 'stream:enabled', ...(config.capabilities || [])];
        this.#meta = {
            type: 'agent',
            subtype: 'llm',
            model: config.model,
            role: config.role || 'assistant',
        };

        // createSecure() requires explicit origins and rejects wildcards.
        this.#bus = CrossBus.createSecure({
            peerId: config.agentId,
            allowedOrigins: config.allowedOrigins,
            capabilities: this.#capabilities,
            meta: this.#meta,
        });

        this.#setupHandlers();
    }

    /**
     * Setup message handlers
     */
    #setupHandlers() {
        // Main inference handler
        this.#bus.handle('infer', async (payload) => {
            return this.#handleInference(payload);
        });

        // Continue with tool results
        this.#bus.handle('tool:result', async (payload) => {
            return this.#handleToolResult(payload);
        });

        // Reset conversation
        this.#bus.handle('reset', async () => {
            this.#conversationHistory = [];
            return { success: true };
        });

        // Get conversation history
        this.#bus.handle('history', async () => {
            return { history: this.#conversationHistory };
        });
    }

    /**
     * Handle inference request
     */
    async #handleInference(payload) {
        const { messages, tools, temperature, maxTokens } = payload;

        // Emit thinking signal
        this.#bus.signal('agent:thinking', {
            agentId: this.#config.agentId,
            startTime: Date.now(),
        });

        try {
            // Add messages to history
            if (messages) {
                this.#conversationHistory.push(...messages);
            }

            // Build LLM request
            const request = {
                model: this.#config.model,
                messages: [
                    { role: 'system', content: this.#config.systemPrompt },
                    ...this.#conversationHistory,
                ],
                tools,
                temperature: temperature ?? 0.7,
                max_tokens: maxTokens ?? 2048,
            };

            // Call LLM
            const response = await this.#config.llmClient(request);

            // Handle tool calls if any
            if (response.tool_calls?.length > 0) {
                return this.#handleToolCalls(response);
            }

            // Add response to history
            this.#conversationHistory.push({
                role: 'assistant',
                content: response.content,
            });

            // Emit response signal
            this.#bus.signal('agent:response', {
                agentId: this.#config.agentId,
                content: response.content,
                finishReason: response.finish_reason,
            });

            return {
                content: response.content,
                finishReason: response.finish_reason,
                usage: response.usage,
            };
        } catch (error) {
            this.#bus.signal('agent:error', {
                agentId: this.#config.agentId,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Handle tool calls from LLM response
     */
    async #handleToolCalls(response) {
        const toolCalls = response.tool_calls;

        // Add assistant message with tool calls to history
        this.#conversationHistory.push({
            role: 'assistant',
            content: null,
            tool_calls: toolCalls,
        });

        // Emit tool call signals
        for (const toolCall of toolCalls) {
            this.#bus.signal('tool:call', {
                agentId: this.#config.agentId,
                callId: toolCall.id,
                tool: toolCall.function.name,
                arguments: JSON.parse(toolCall.function.arguments),
            });
        }

        return {
            toolCalls: toolCalls.map((tc) => ({
                id: tc.id,
                tool: tc.function.name,
                arguments: JSON.parse(tc.function.arguments),
            })),
            requiresToolResults: true,
        };
    }

    /**
     * Handle tool result and continue inference
     */
    async #handleToolResult(payload) {
        const { callId, result, error } = payload;

        // Add tool result to history
        this.#conversationHistory.push({
            role: 'tool',
            tool_call_id: callId,
            content: error ? JSON.stringify({ error }) : JSON.stringify(result),
        });

        // Continue inference
        return this.#handleInference({});
    }

    /**
     * Get the CrossBus instance for this agent
     */
    getBus() {
        return this.#bus;
    }

    /**
     * Connect to a hub or parent and announce this agent with agent:ready.
     * @returns {Function} Cleanup that removes the transport.
     */
    connect(transport, options) {
        const removeTransport = this.#bus.addTransport(transport, options);
        this.#bus.signal('agent:ready', { capabilities: this.#capabilities, meta: this.#meta });
        return removeTransport;
    }

    /**
     * Cleanup and destroy the agent
     */
    destroy() {
        this.#bus.destroy();
    }
}

// ============================================
// USAGE EXAMPLE
// ============================================

/*
const { PostMessageTransport } = await import('crossbus');

const HUB_ORIGIN = 'https://app.example.com';

// Create agent
const agent = new LLMAgent({
  agentId: 'planner',
  model: 'your-model-id',
  systemPrompt: 'You are a task planning assistant. Break down user goals into actionable steps.',
  allowedOrigins: [HUB_ORIGIN],
  llmClient: async (request) => {
    // Call your own backend, which holds provider credentials and applies
    // authorization and quotas. Never ship model-provider API keys to a browser context.
    const response = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`LLM backend error: ${response.status}`);
    return response.json();
  },
});

// Connect to the orchestrator (its peerId defaults to 'orchestrator')
agent.connect(
  new PostMessageTransport(window.parent, { targetOrigin: HUB_ORIGIN, allowedOrigins: [HUB_ORIGIN] }),
  { peerId: 'orchestrator' }
);
*/

export default LLMAgent;
