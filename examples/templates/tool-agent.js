/**
 * Tool Agent Template
 * 
 * Template for creating a tool/function agent that provides
 * executable capabilities to other agents via CrossBus.
 * 
 * @example
 * const toolAgent = new ToolAgent('calculator');
 * toolAgent.registerTool('add', { a: 'number', b: 'number' }, ({ a, b }) => a + b);
 */

import { CrossBus } from 'crossbus';

export class ToolAgent {
    #bus;
    #tools = new Map();
    #executionStats = { total: 0, success: 0, failed: 0 };

    /**
     * Create a Tool Agent
     * @param {string} toolId - Unique identifier for this tool agent
     * @param {Object} [options] - Configuration options
     */
    constructor(toolId, options = {}) {
        this.#bus = new CrossBus({
            peerId: `tool:${toolId}`,
            capabilities: ['agent:tool'],
            meta: {
                type: 'tool',
                toolId,
                version: options.version || '1.0.0',
                description: options.description || `Tool agent: ${toolId}`,
            },
        });

        this.#setupHandlers();
    }

    /**
     * Setup message handlers
     */
    #setupHandlers() {
        // Execute a tool
        this.#bus.handle('execute', async (payload) => {
            return this.#execute(payload);
        });

        // Describe available tools (OpenAI function format)
        this.#bus.handle('describe', async () => {
            return this.#describe();
        });

        // Get execution stats
        this.#bus.handle('stats', async () => {
            return { stats: this.#executionStats };
        });

        // Health check
        this.#bus.handle('ping', async () => {
            return { pong: true, timestamp: Date.now() };
        });
    }

    /**
     * Register a tool
     * @param {string} name - Tool name
     * @param {Object} schema - JSON Schema for parameters
     * @param {Function} fn - Tool implementation
     */
    registerTool(name, schema, fn) {
        this.#tools.set(name, {
            name,
            schema: {
                type: 'object',
                properties: schema.properties || schema,
                required: schema.required || Object.keys(schema.properties || schema),
                description: schema.description,
            },
            fn,
        });

        // Update capabilities
        this.#bus.meta = {
            ...this.#bus.meta,
            tools: Array.from(this.#tools.keys()),
        };
    }

    /**
     * Execute a tool
     */
    async #execute(payload) {
        const { tool, params, timeout = 30000 } = payload;
        this.#executionStats.total++;

        const toolDef = this.#tools.get(tool);
        if (!toolDef) {
            this.#executionStats.failed++;
            throw new Error(`Unknown tool: ${tool}`);
        }

        // Validate params
        this.#validateParams(params, toolDef.schema);

        const startTime = Date.now();

        try {
            // Execute with timeout
            const result = await Promise.race([
                toolDef.fn(params),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Execution timeout')), timeout)
                ),
            ]);

            this.#executionStats.success++;

            return {
                success: true,
                result,
                executionTime: Date.now() - startTime,
            };
        } catch (error) {
            this.#executionStats.failed++;

            return {
                success: false,
                error: {
                    code: error.code || 'EXECUTION_ERROR',
                    message: error.message,
                },
                executionTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Describe available tools in OpenAI function format
     */
    #describe() {
        return {
            tools: Array.from(this.#tools.entries()).map(([name, def]) => ({
                type: 'function',
                function: {
                    name,
                    description: def.schema.description || `Execute ${name}`,
                    parameters: {
                        type: 'object',
                        properties: def.schema.properties,
                        required: def.schema.required,
                    },
                },
            })),
        };
    }

    /**
     * Validate parameters against schema
     */
    #validateParams(params, schema) {
        if (!schema.required) return;

        for (const key of schema.required) {
            if (!(key in params)) {
                throw new Error(`Missing required parameter: ${key}`);
            }
        }

        // Type validation
        for (const [key, propSchema] of Object.entries(schema.properties || {})) {
            if (key in params) {
                const value = params[key];
                const expectedType = propSchema.type;

                if (expectedType && typeof value !== expectedType) {
                    if (!(expectedType === 'integer' && Number.isInteger(value))) {
                        throw new Error(
                            `Invalid type for ${key}: expected ${expectedType}, got ${typeof value}`
                        );
                    }
                }
            }
        }
    }

    /**
     * Get the CrossBus instance
     */
    getBus() {
        return this.#bus;
    }

    /**
     * Connect to a hub or parent
     */
    connect(transport, options) {
        this.#bus.addTransport(transport, options);
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
import { PostMessageTransport } from 'crossbus';

// Create tool agent
const calculator = new ToolAgent('calculator', {
  description: 'Mathematical operations',
});

// Register tools
calculator.registerTool('add', {
  properties: {
    a: { type: 'number', description: 'First number' },
    b: { type: 'number', description: 'Second number' },
  },
  required: ['a', 'b'],
  description: 'Add two numbers',
}, ({ a, b }) => a + b);

calculator.registerTool('multiply', {
  properties: {
    a: { type: 'number' },
    b: { type: 'number' },
  },
  required: ['a', 'b'],
  description: 'Multiply two numbers',
}, ({ a, b }) => a * b);

calculator.registerTool('factorial', {
  properties: {
    n: { type: 'integer', description: 'Non-negative integer' },
  },
  required: ['n'],
  description: 'Calculate factorial',
}, ({ n }) => {
  if (n < 0) throw new Error('n must be non-negative');
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
});

// Connect to hub
calculator.connect(new PostMessageTransport(window.parent), { peerId: 'hub' });
*/

export default ToolAgent;
