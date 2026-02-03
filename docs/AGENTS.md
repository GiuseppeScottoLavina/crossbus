# CrossBus - Agentic Infrastructure

> **CrossBus provides unified messaging for browser applications — connecting iframes, workers, tabs, and WebViews.**
> 
> This document enables AI agents to autonomously use CrossBus as communication infrastructure in agentic architectures.

---

## 🎯 What Is CrossBus For Agents?

CrossBus provides the **inter-process communication layer** that enables:

| Pattern | Description | Example |
|---------|-------------|---------|
| **Agent ↔ Agent** | Direct communication between AI agents | Two LLM agents coordinating a task |
| **Agent ↔ Tool** | Agent invoking tools in isolated contexts | Agent calling a sandboxed code executor |
| **Agent ↔ UI** | Agent updating user interface | Agent pushing progress updates |
| **Agent ↔ Worker** | Offloading compute to workers | Agent delegating heavy processing |
| **Agent ↔ Storage** | Persistent state in another context | Agent syncing state across tabs |

---

## ⚡ Quick Start for AI Agents

### Minimal Setup (Core Only)

```javascript
// ALWAYS start with just what you need
import { CrossBus } from 'crossbus';

const bus = new CrossBus({ isHub: true, peerId: 'orchestrator' });
```

### Lazy Loading Pattern (RECOMMENDED)

**CRITICAL**: Always use dynamic imports for optional features to minimize bundle size.

```javascript
// ❌ BAD: Imports everything upfront
import { CrossBus, VectorClock, CausalOrderer, SharedWorkerTransport } from 'crossbus';

// ✅ GOOD: Import only core, lazy load the rest
import { CrossBus } from 'crossbus';

// Load causal ordering only when needed
async function enableCausalOrdering() {
  const { VectorClock, CausalOrderer } = await import('crossbus');
  return new CausalOrderer(bus.peerId, { onDeliver: handleMessage });
}

// Load transport only when needed
async function setupSharedWorker() {
  const { SharedWorkerTransport } = await import('crossbus');
  return new SharedWorkerTransport({ workerUrl: '/worker.js' });
}

// Load plugins only when needed
async function enableRetry() {
  const { withRetry } = await import('crossbus/plugins/retry');
  return withRetry(bus, { maxRetries: 3 });
}
```

---

## 📦 Import Guide for Agents

| What You Need | Import Statement | Bundle Impact |
|---------------|------------------|---------------|
| **Core messaging** | `import { CrossBus } from 'crossbus'` | ~32 KB |
| **Ultra-minimal** | `import { createNanoEmitter } from 'crossbus/nano'` | **248 B** |
| **Retry plugin** | `await import('crossbus/plugins/retry')` | +2 KB (lazy) |
| **Circuit breaker** | `await import('crossbus/plugins/circuit-breaker')` | +3 KB (lazy) |
| **Causal ordering** | `import { VectorClock, CausalOrderer } from 'crossbus'` | Included |
| **Transports** | `import { SharedWorkerTransport } from 'crossbus'` | Included |

### Building Multi-Agent Apps

```javascript
// main.js - Entry point (keep small!)
import { CrossBus } from 'crossbus';

const hub = new CrossBus({ isHub: true, peerId: 'main' });

// Lazy load agent modules
const loadAgent = async (name) => {
  const module = await import(`./agents/${name}.js`);
  return module.createAgent(hub);
};

// Initialize agents on demand
document.getElementById('start').onclick = async () => {
  const [planner, executor] = await Promise.all([
    loadAgent('planner'),
    loadAgent('executor')
  ]);
};
```

```javascript
// agents/planner.js - Agent module (lazy loaded)
export function createAgent(hub) {
  hub.handle('plan:create', async (task) => {
    const steps = await generatePlan(task);
    return { steps };
  });
  
  return { 
    name: 'planner',
    destroy: () => hub.unhandle('plan:create')
  };
}
```

---

## 🔧 Build Configuration

### Vite (Recommended)

```javascript
// vite.config.js
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'crossbus-core': ['crossbus'],
          'crossbus-plugins': [
            'crossbus/plugins/retry',
            'crossbus/plugins/circuit-breaker'
          ]
        }
      }
    }
  }
};
```

### Webpack

```javascript
// webpack.config.js
module.exports = {
  optimization: {
    splitChunks: {
      cacheGroups: {
        crossbus: {
          test: /[\\/]node_modules[\\/]crossbus/,
          name: 'crossbus',
          chunks: 'async' // Lazy load
        }
      }
    }
  }
};
```

---

## 🏗️ Agentic Architecture Patterns

### Pattern 1: Hub-and-Spoke (Orchestrator)

```
                    ┌─────────────┐
                    │  ORCHESTRATOR│
                    │   (Hub)      │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           │               │               │
    ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
    │  AGENT A    │ │  AGENT B    │ │   TOOL C    │
    │  (iframe)   │ │  (worker)   │ │  (iframe)   │
    └─────────────┘ └─────────────┘ └─────────────┘
```

**Use when**: Central coordinator manages task distribution.

```javascript
// Orchestrator (Hub)
const orchestrator = new CrossBus({ isHub: true, peerId: 'orchestrator' });

orchestrator.handle('task:complete', async ({ agentId, result }) => {
  return await assignNextTask(agentId, result);
});

orchestrator.handle('tool:call', async ({ tool, params }) => {
  const toolPeer = orchestrator.getPeer(`tool:${tool}`);
  if (!toolPeer) throw new Error(`Tool ${tool} not available`);
  return await orchestrator.request(`tool:${tool}`, 'execute', params);
});
```

---

### Pattern 2: Peer-to-Peer (Collaborative Agents)

```
    ┌─────────────┐         ┌─────────────┐
    │  AGENT A    │◄───────►│  AGENT B    │
    └──────┬──────┘         └──────┬──────┘
           │                       │
           └───────────┬───────────┘
                       │
                ┌──────▼──────┐
                │  AGENT C    │
                └─────────────┘
```

**Use when**: Agents need direct communication without central bottleneck.

```javascript
// Each agent creates direct channels via BroadcastChannel
const agent = new CrossBus({ peerId: `agent:${agentId}` });
const broadcast = new BroadcastChannelTransport('agents-mesh');

agent.on('collaboration:request', async (event) => {
  const { fromAgent, task } = event.data;
  const result = await processSubtask(task);
  agent.signal('collaboration:response', { toAgent: fromAgent, result });
});
```

---

### Pattern 3: Pipeline (Sequential Processing)

```
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │  INGESTION  │────►│  PROCESSING │────►│   OUTPUT    │
    │   AGENT     │     │    AGENT    │     │   AGENT     │
    └─────────────┘     └─────────────┘     └─────────────┘
```

**Use when**: Data flows through stages sequentially.

```javascript
// Pipeline stage
const stage = new CrossBus({ peerId: 'processing-stage' });

stage.handle('process', async (data) => {
  const result = await transform(data);
  // Forward to next stage
  await stage.request('output-stage', 'render', result);
  return { forwarded: true };
});
```

---

## 📡 Agent Communication Protocol

### Message Envelope Structure

Every CrossBus message follows this structure (for agent parsing):

```typescript
interface AgentMessage {
  // Wire format (compact)
  _cb: 1;                    // Protocol marker (always 1)
  id: string;                // Unique message ID
  t: 'sig' | 'req' | 'res';  // Type: signal, request, response
  ts: number;                // Timestamp (ms since epoch)
  seq: number;               // Sequence number (for ordering)
  p: any;                    // Payload (your data)
  
  // For requests
  handler?: string;          // Handler name to invoke
  
  // For responses
  success?: boolean;         // Whether handler succeeded
  data?: any;                // Response data
  error?: {                  // Error info
    code: string;
    message: string;
  };
}
```

### Semantic Signal Naming Convention

Use hierarchical names for discoverability:

```
<domain>:<action>[:<subaction>]

Examples:
  agent:ready              - Agent initialized
  agent:thinking           - Agent is processing
  agent:response           - Agent produced output
  task:assigned            - Task assigned to agent
  task:progress            - Task progress update
  task:complete            - Task finished
  task:error               - Task failed
  tool:call                - Tool invocation
  tool:result              - Tool result
  memory:store             - Store in memory
  memory:retrieve          - Retrieve from memory
  ui:update                - UI update needed
  ui:input                 - User input received
```

---

## 🔧 Agent Capabilities System

### Capability Negotiation

Agents can announce and discover capabilities during handshake:

```javascript
const agent = new CrossBus({
  peerId: 'code-executor',
  capabilities: [
    'execute:javascript',
    'execute:python',
    'sandbox:enabled',
    'max-runtime:30000'
  ],
  meta: {
    type: 'tool',
    version: '1.0.0',
    description: 'Secure code execution sandbox'
  }
});

// Orchestrator can check capabilities
const peer = hub.getPeer('code-executor');
if (peer?.capabilities?.includes('execute:python')) {
  await hub.request('code-executor', 'execute', { 
    language: 'python', 
    code: 'print("Hello")' 
  });
}
```

### Standard Capability Tokens

| Capability | Meaning |
|------------|---------|
| `agent:llm` | Is an LLM-based agent |
| `agent:tool` | Is a tool/function |
| `agent:ui` | Has UI rendering |
| `execute:<lang>` | Can execute code in language |
| `memory:read` | Can read from shared memory |
| `memory:write` | Can write to shared memory |
| `stream:enabled` | Supports streaming responses |
| `priority:high` | High-priority agent |

---

## 📋 Agent Implementation Templates

### Template: LLM Agent

```javascript
import { CrossBus } from 'crossbus';

class LLMAgent {
  #bus;
  #model;
  #systemPrompt;
  
  constructor(config) {
    this.#bus = new CrossBus({
      peerId: config.agentId,
      capabilities: ['agent:llm', 'stream:enabled'],
      meta: {
        type: 'agent',
        model: config.model,
        role: config.role
      }
    });
    
    this.#model = config.model;
    this.#systemPrompt = config.systemPrompt;
    
    this.#setupHandlers();
  }
  
  #setupHandlers() {
    // Handle inference requests
    this.#bus.handle('infer', async (payload) => {
      this.#bus.signal('agent:thinking', { agentId: this.#bus.peerId });
      
      const response = await this.#callLLM(payload.messages);
      
      this.#bus.signal('agent:response', { 
        agentId: this.#bus.peerId,
        response 
      });
      
      return response;
    });
    
    // Handle tool results
    this.#bus.handle('tool:result', async ({ callId, result }) => {
      return await this.#continueWithToolResult(callId, result);
    });
  }
  
  async #callLLM(messages) {
    // Your LLM API call here
  }
  
  // Expose for orchestrator to add as peer
  getMessageHandler() {
    return (msg, origin, peerId, replyFn) => 
      this.#bus.handleMessage(msg, origin, peerId, replyFn);
  }
  
  destroy() {
    this.#bus.destroy();
  }
}
```

### Template: Tool Agent

```javascript
import { CrossBus } from 'crossbus';

class ToolAgent {
  #bus;
  #tools = new Map();
  
  constructor(toolId) {
    this.#bus = new CrossBus({
      peerId: `tool:${toolId}`,
      capabilities: this.#getCapabilities(),
      meta: { type: 'tool', toolId }
    });
    
    this.#bus.handle('execute', this.#execute.bind(this));
    this.#bus.handle('describe', this.#describe.bind(this));
  }
  
  registerTool(name, schema, fn) {
    this.#tools.set(name, { schema, fn });
  }
  
  #getCapabilities() {
    return Array.from(this.#tools.keys()).map(t => `tool:${t}`);
  }
  
  async #execute({ tool, params }) {
    const toolDef = this.#tools.get(tool);
    if (!toolDef) {
      throw new Error(`Unknown tool: ${tool}`);
    }
    
    // Validate params against schema
    this.#validateParams(params, toolDef.schema);
    
    // Execute with timeout
    return await toolDef.fn(params);
  }
  
  #describe() {
    // Return OpenAI-compatible function schemas
    return {
      tools: Array.from(this.#tools.entries()).map(([name, def]) => ({
        type: 'function',
        function: {
          name,
          description: def.schema.description,
          parameters: def.schema.parameters
        }
      }))
    };
  }
  
  #validateParams(params, schema) {
    // JSON Schema validation
  }
}
```

### Template: Orchestrator

```javascript
import { CrossBus } from 'crossbus';

class AgentOrchestrator {
  #bus;
  #agents = new Map();
  #taskQueue = [];
  
  constructor() {
    this.#bus = new CrossBus({
      isHub: true,
      peerId: 'orchestrator',
      capabilities: ['orchestrator'],
      meta: { type: 'orchestrator' }
    });
    
    this.#setupEventHandlers();
    this.#setupRPCHandlers();
  }
  
  #setupEventHandlers() {
    this.#bus.on('peer:connected', (event) => {
      const { peerId, meta, capabilities } = event.data;
      this.#agents.set(peerId, { meta, capabilities, status: 'ready' });
      console.log(`Agent registered: ${peerId}`, meta);
    });
    
    this.#bus.on('peer:disconnected', (event) => {
      this.#agents.delete(event.data.peerId);
    });
    
    this.#bus.on('agent:thinking', (event) => {
      this.#agents.get(event.data.agentId).status = 'thinking';
    });
    
    this.#bus.on('agent:response', (event) => {
      this.#agents.get(event.data.agentId).status = 'ready';
    });
  }
  
  #setupRPCHandlers() {
    // Route tool calls to appropriate tool agents
    this.#bus.handle('tool:call', async ({ tool, params }) => {
      const toolAgent = this.#findAgentWithCapability(`tool:${tool}`);
      if (!toolAgent) throw new Error(`No agent provides tool: ${tool}`);
      
      return await this.#bus.request(toolAgent, 'execute', { tool, params });
    });
    
    // Get available tools across all agents
    this.#bus.handle('tools:list', async () => {
      const allTools = [];
      for (const [peerId, agent] of this.#agents) {
        if (agent.meta.type === 'tool') {
          const tools = await this.#bus.request(peerId, 'describe');
          allTools.push(...tools.tools);
        }
      }
      return { tools: allTools };
    });
  }
  
  #findAgentWithCapability(cap) {
    for (const [peerId, agent] of this.#agents) {
      if (agent.capabilities?.includes(cap)) return peerId;
    }
    return null;
  }
  
  async delegateTask(agentId, task) {
    return await this.#bus.request(agentId, 'infer', task);
  }
  
  async broadcastTask(task) {
    const llmAgents = Array.from(this.#agents.entries())
      .filter(([_, a]) => a.capabilities?.includes('agent:llm'))
      .map(([id]) => id);
    
    const results = await Promise.all(
      llmAgents.map(id => this.#bus.request(id, 'infer', task))
    );
    
    return results;
  }
}
```

### Template: Memory/State Agent

```javascript
import { CrossBus } from 'crossbus';

class MemoryAgent {
  #bus;
  #store = new Map();
  #vectorIndex = null;
  
  constructor() {
    this.#bus = new CrossBus({
      peerId: 'memory',
      capabilities: ['memory:read', 'memory:write', 'memory:search'],
      meta: { type: 'memory', storage: 'in-memory' }
    });
    
    this.#bus.handle('store', this.#store.bind(this));
    this.#bus.handle('retrieve', this.#retrieve.bind(this));
    this.#bus.handle('search', this.#search.bind(this));
    this.#bus.handle('list', this.#list.bind(this));
    this.#bus.handle('delete', this.#delete.bind(this));
  }
  
  async #store({ key, value, metadata }) {
    const entry = {
      value,
      metadata,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.#store.set(key, entry);
    
    // Notify other agents
    this.#bus.signal('memory:updated', { key, action: 'store' });
    
    return { success: true, key };
  }
  
  async #retrieve({ key }) {
    const entry = this.#store.get(key);
    return entry || null;
  }
  
  async #search({ query, limit = 10 }) {
    // Semantic search implementation
    // Return top-k relevant entries
  }
  
  async #list({ prefix, limit = 100 }) {
    const keys = Array.from(this.#store.keys())
      .filter(k => !prefix || k.startsWith(prefix))
      .slice(0, limit);
    return { keys };
  }
  
  async #delete({ key }) {
    const deleted = this.#store.delete(key);
    if (deleted) {
      this.#bus.signal('memory:updated', { key, action: 'delete' });
    }
    return { deleted };
  }
}
```

---

## 🔄 State Machine Reference

### Handshake States

```
┌─────────┐  INIT   ┌───────────┐  ACK   ┌───────────┐  COMPLETE  ┌───────────┐
│  IDLE   │────────►│ INIT_SENT │───────►│ ACK_SENT  │───────────►│ CONNECTED │
└─────────┘         └───────────┘        └───────────┘            └───────────┘
                          │                    │
                          │ TIMEOUT/REJECT     │ TIMEOUT/REJECT
                          ▼                    ▼
                    ┌───────────┐        ┌───────────┐
                    │  FAILED   │        │  FAILED   │
                    └───────────┘        └───────────┘
```

### Circuit Breaker States

```
┌────────┐  failure_count >= threshold  ┌────────┐
│ CLOSED │─────────────────────────────►│  OPEN  │
└────────┘                              └────────┘
     ▲                                       │
     │  success_count >= threshold           │ reset_timeout elapsed
     │                                       ▼
     │                                 ┌───────────┐
     └─────────────────────────────────│ HALF_OPEN │
                                       └───────────┘
                                            │
                                            │ failure
                                            ▼
                                       ┌────────┐
                                       │  OPEN  │
                                       └────────┘
```

### Peer Status States

```
┌─────────────┐
│ CONNECTING  │──────────────────────┐
└──────┬──────┘                      │
       │ handshake success           │ handshake failed
       ▼                             ▼
┌─────────────┐              ┌─────────────┐
│  CONNECTED  │              │   FAILED    │
└──────┬──────┘              └─────────────┘
       │ disconnect                  ▲
       ▼                             │ max attempts
┌──────────────┐                     │
│ DISCONNECTED │──────────┐          │
└──────────────┘          │          │
       ▲                  │ auto-reconnect
       │                  ▼          │
       │         ┌──────────────┐    │
       └─────────│ RECONNECTING │────┘
                 └──────────────┘
```

---

## 📊 Observability for Agents

### Runtime Introspection

```javascript
// Get full system state
function getSystemState(orchestrator) {
  return {
    orchestratorId: orchestrator.peerId,
    agents: Array.from(orchestrator.peers).map(peerId => ({
      id: peerId,
      ...orchestrator.getPeer(peerId)
    })),
    pendingRequests: orchestrator.pendingRequests?.size ?? 0,
    uptime: Date.now() - orchestrator.startTime
  };
}

// Monitor all messages
function enableTracing(bus) {
  const trace = [];
  
  bus.addInboundHook((payload, ctx) => {
    trace.push({
      direction: 'in',
      type: ctx.type,
      peerId: ctx.peerId,
      timestamp: Date.now(),
      payload: JSON.stringify(payload).slice(0, 200)
    });
    return payload;
  });
  
  bus.addOutboundHook((payload, ctx) => {
    trace.push({
      direction: 'out',
      type: ctx.type,
      peerId: ctx.peerId,
      timestamp: Date.now(),
      payload: JSON.stringify(payload).slice(0, 200)
    });
    return payload;
  });
  
  return () => trace;
}
```

### Health Checks

```javascript
// Orchestrator exposes health check
orchestrator.handle('health', async () => {
  const agentHealth = await Promise.allSettled(
    Array.from(agents.keys()).map(async (peerId) => {
      try {
        const start = Date.now();
        await orchestrator.request(peerId, 'ping', {}, { timeout: 5000 });
        return { peerId, status: 'healthy', latency: Date.now() - start };
      } catch (error) {
        return { peerId, status: 'unhealthy', error: error.code };
      }
    })
  );
  
  return {
    status: agentHealth.every(r => r.value?.status === 'healthy') ? 'healthy' : 'degraded',
    agents: agentHealth.map(r => r.value || r.reason),
    timestamp: Date.now()
  };
});
```

---

## 🔐 Security for Agentic Systems

### Origin Isolation

```javascript
// Sandbox untrusted tool agents in iframes with restrictive origins
const orchestrator = new CrossBus({
  isHub: true,
  peerId: 'orchestrator',
  allowedOrigins: [
    'https://trusted-agents.myapp.com',     // Trusted agents
    'https://sandbox.myapp.com'             // Sandboxed tools
  ]
});
```

### Message Validation

```javascript
// Validate all incoming payloads
orchestrator.addInboundHook((payload, ctx) => {
  // Reject oversized payloads
  if (JSON.stringify(payload).length > 100000) {
    throw new Error('Payload too large');
  }
  
  // Validate known message types
  if (ctx.type === 'request' && ctx.handlerName === 'execute') {
    if (!payload.tool || !payload.params) {
      throw new Error('Invalid execute payload');
    }
  }
  
  return payload;
});
```

### Rate Limiting

```javascript
const rateLimiter = new Map();

orchestrator.addInboundHook((payload, ctx) => {
  const key = ctx.peerId;
  const now = Date.now();
  const windowMs = 1000;
  const maxRequests = 100;
  
  const history = rateLimiter.get(key) || [];
  const recent = history.filter(t => t > now - windowMs);
  
  if (recent.length >= maxRequests) {
    throw new Error('Rate limit exceeded');
  }
  
  recent.push(now);
  rateLimiter.set(key, recent);
  
  return payload;
});
```

---

## 🧪 Testing Agentic Systems

### Mock Agent for Testing

```javascript
function createMockAgent(responses = {}) {
  const bus = new CrossBus({ peerId: `mock-${Date.now()}` });
  
  for (const [handler, response] of Object.entries(responses)) {
    bus.handle(handler, async () => {
      if (typeof response === 'function') return response();
      return response;
    });
  }
  
  return bus;
}

// Usage in tests
const mockTool = createMockAgent({
  'execute': { result: 'mocked result' },
  'describe': { tools: [] }
});
```

### Chaos Testing

```javascript
// Introduce random failures for resilience testing
function addChaos(bus, failureRate = 0.1) {
  bus.addInboundHook((payload, ctx) => {
    if (Math.random() < failureRate) {
      throw new Error('Chaos monkey: random failure');
    }
    return payload;
  });
}
```

---

## 📚 Quick Reference Card

### Essential Operations

| Need | Code |
|------|------|
| Create orchestrator | `new CrossBus({ isHub: true, peerId: 'orch' })` |
| Create agent | `new CrossBus({ peerId: 'agent-1', capabilities: [...] })` |
| RPC call | `await bus.request(peerId, handler, payload)` |
| Broadcast event | `bus.signal(name, payload)` |
| Register handler | `bus.handle(name, async (p) => result)` |
| Add peer | `bus.addPeer(id, sendFn)` |
| Get peer info | `bus.getPeer(id)` |
| List peers | `bus.peers` |
| Cleanup | `bus.destroy()` |

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `ERR_PEER_NOT_FOUND` | Peer doesn't exist | Check peer is connected |
| `ERR_NO_HANDLER` | Handler not registered | Register handler on target |
| `ERR_RESPONSE_TIMEOUT` | Peer is slow | Increase timeout or check peer |
| `ERR_MAX_PENDING` | Too many requests | Implement backpressure |
| `ERR_DESTROYED` | Bus was destroyed | Don't use after destroy() |

### Performance Targets

| Operation | Benchmark | Notes |
|-----------|-----------|-------|
| emitSync (1 listener) | **185M ops/sec** | Beats nanoevents 1.08x |
| emitSync (10KB) | **135M ops/sec** | Beats nanoevents 1.42x |
| createFastEmitter emit | **62M ops/sec** | Beats nanoevents 1.21x |
| Peer lookup | 8.9M ops/sec | O(1) Map lookup |
| Cross-context RPC | ~1-5ms | Depends on payload size |

---

## ⚡ Performance APIs for AI Agents

Choose the right API based on your performance needs:

### 1. crossbus/nano (248 bytes gzipped)

Ultra-minimal for size-critical deployments:

```javascript
import { createNanoEmitter } from 'crossbus/nano';

const bus = createNanoEmitter();
const off = bus.on('event', (data) => console.log(data));
bus.emit('event', { value: 42 });
off(); // Cleanup
```

**Best for**: Hot paths, high-frequency events, minimal bundle size.

### 2. createFastEmitter (from main bundle)

Plain object emitter for maximum emit performance:

```javascript
import { createFastEmitter } from 'crossbus';

const emitter = createFastEmitter();
emitter.on('tick', handler);
emitter.emit('tick', data); // 62M ops/sec
```

**Best for**: Game loops, animation frames, real-time data.

### 3. EventEmitter Class (full features)

Feature-rich for complex agent systems:

```javascript
import { EventEmitter } from 'crossbus';

const emitter = new EventEmitter();
emitter.on('*:update', handler);  // Wildcards
emitter.on('task', fn, { priority: 10 }); // Priority
emitter.on('msg', fn, { signal: controller.signal }); // AbortSignal
```

**Best for**: Agent orchestration, plugin systems, complex routing.

### 4. Full CrossBus (cross-context)

Complete messaging infrastructure:

```javascript
import { CrossBus } from 'crossbus';

const bus = new CrossBus({ isHub: true });
await bus.request('agent:worker', 'compute', data);
```

---

## 🚀 Transport Options

Choose the optimal transport for your use case:

| Transport | Best For | Persistence | Cross-Tab |
|-----------|----------|-------------|-----------|
| `PostMessageTransport` | iframes, popups, workers | ❌ | ❌ |
| `BroadcastChannelTransport` | Same-origin tab sync | ❌ | ✅ |
| `MessageChannelTransport` | Direct peer-to-peer | ❌ | ❌ |
| `SharedWorkerTransport` | Shared state across tabs | ✅ | ✅ |
| `ServiceWorkerTransport` | Offline capability | ✅ | ✅ |

### SharedWorkerTransport

Persistent shared context across all tabs:

```javascript
import { SharedWorkerTransport } from 'crossbus';

const transport = new SharedWorkerTransport({
  workerUrl: '/shared-hub.js'
});

transport.onMessage((msg) => handleMessage(msg));
transport.send({ t: 'sig', id: 'x', p: { sync: true } });
```

### ServiceWorkerTransport

Offline-capable with background sync:

```javascript
import { ServiceWorkerTransport } from 'crossbus';

const transport = new ServiceWorkerTransport();
await transport.ready;

transport.send({ t: 'sig', id: 'y', p: { queueOffline: true } });
```

---

## 🔄 Causal Ordering (for Distributed State)

For distributed systems requiring causal consistency:

### VectorClock

Track causal order across distributed agents:

```javascript
import { VectorClock } from 'crossbus';

const clock = new VectorClock('agent-1');

// Before sending
clock.tick();
send({ data, clock: clock.toJSON() });

// On receive
const remoteClock = VectorClock.fromJSON(msg.clock);
if (clock.canDeliver(remoteClock, senderId)) {
  clock.update(remoteClock);
  deliver(msg);
}
```

### CausalOrderer

Automatic buffering for out-of-order messages:

```javascript
import { CausalOrderer } from 'crossbus';

const orderer = new CausalOrderer('agent-1', {
  onDeliver: (msg) => processInOrder(msg),
  maxBufferSize: 1000
});

// Messages delivered in causal order automatically
orderer.receive(senderId, message);

// Get clock for outgoing message
const clock = orderer.tick();
```

**Use When**: Multi-agent state sync, distributed locks, CRDT implementations.

---

## ⚡ Performance APIs for AI Agents

Choose the right API based on your performance needs:

### 1. crossbus/nano (248 bytes gzipped)

Ultra-minimal for size-critical deployments:

```javascript
import { createNanoEmitter } from 'crossbus/nano';

const bus = createNanoEmitter();
const off = bus.on('event', (data) => console.log(data));
bus.emit('event', { value: 42 });
off(); // Cleanup
```

**Best for**: Hot paths, high-frequency events, minimal bundle size.

### 2. createFastEmitter (from main bundle)

Plain object emitter for maximum emit performance:

```javascript
import { createFastEmitter } from 'crossbus';

const emitter = createFastEmitter();
emitter.on('tick', handler);
emitter.emit('tick', data); // 62M ops/sec
```

**Best for**: Game loops, animation frames, real-time data.

### 3. EventEmitter Class (full features)

Feature-rich for complex agent systems:

```javascript
import { EventEmitter } from 'crossbus';

const emitter = new EventEmitter();
emitter.on('*:update', handler);  // Wildcards
emitter.on('task', fn, { priority: 10 }); // Priority
emitter.on('msg', fn, { signal: controller.signal }); // AbortSignal
```

**Best for**: Agent orchestration, plugin systems, complex routing.

### 4. Full CrossBus (cross-context)

Complete messaging infrastructure:

```javascript
import { CrossBus } from 'crossbus';

const bus = new CrossBus({ isHub: true });
await bus.request('agent:worker', 'compute', data);
```

**Best for**: Multi-agent systems, iframe/worker communication.

---

## 🔗 Integration Points

CrossBus is designed to integrate with:

| System | Integration |
|--------|-------------|
| **LangChain/LangGraph** | Tool execution via CrossBus |
| **Vercel AI SDK** | Streaming responses through signals |
| **AutoGen** | Multi-agent conversation routing |
| **CrewAI** | Agent-to-agent delegation |
| **OpenAI Functions** | Tool agent implementation |

---

## 🛡️ AI Agent Safety Features

### Production-Ready Setup

```javascript
// createSecure() enforces best practices
const hub = CrossBus.createSecure({
  peerId: 'production-hub',
  isHub: true,
  allowedOrigins: ['https://agents.myapp.com']
});
// Automatically enforces:
// - strictMode: true (no wildcards)
// - maxPayloadSize: 1MB
// - maxPendingRequests: 100
// - requestTimeout: 30s
```

### Handler Security Options

```javascript
// Restrict who can call sensitive handlers
hub.handle('admin:deleteUser', async (payload) => {
  return await deleteUser(payload.userId);
}, {
  allowedPeers: ['admin-agent'],  // Only admin can call
  rateLimit: 10,                   // Max 10 calls/second
  validatePayload: (p) => p && typeof p.userId === 'string'
});
```

| Option | Description | Error Code |
|--------|-------------|------------|
| `allowedPeers` | Whitelist of peer IDs | `ERR_UNAUTHORIZED` |
| `rateLimit` | Max calls/second per peer | `ERR_RATE_LIMITED` |
| `validatePayload` | Custom validation function | `ERR_INVALID_PAYLOAD` |

### Schema Validation

```javascript
import { withSchemaValidation } from 'crossbus/plugins/schema-validation';

const taskSchema = {
  type: 'object',
  required: ['taskId', 'action'],
  properties: {
    taskId: { type: 'string' },
    action: { enum: ['start', 'stop', 'pause'] },
    params: { type: 'object' }
  }
};

hub.handle('task:execute', withSchemaValidation(taskSchema, async (payload) => {
  // payload is pre-validated!
  return await executeTask(payload);
}));
```

### Health Monitoring

```javascript
// Agent can report its health
const health = agent.healthCheck();
// {
//   status: 'healthy' | 'degraded' | 'unhealthy',
//   peerId: 'my-agent',
//   uptime: 123456,
//   peers: { total: 3, ids: ['hub', 'tool-1', 'tool-2'] },
//   handlers: ['process', 'status'],
//   memory: { heapUsed: 12345678 }
// }

// Orchestrator can monitor all agents
orchestrator.handle('health:check', async () => {
  return orchestrator.healthCheck();
});
```

### Debug Mode for Troubleshooting

```javascript
const agent = new CrossBus({
  peerId: 'debug-agent',
  debug: true,
  debugPrefix: '[Agent]'
});

// Console output:
// [Agent] ℹ️ Initialized (isHub: false)
// [Agent] → SIGNAL "ready" to 1 peers
// [Agent] → REQUEST "getData" to hub
// [Agent] ← RESPONSE from hub (success)
```

---

## 📦 Bundle Size Guide

| Entry Point | Size | Use Case |
|-------------|------|----------|
| `crossbus/nano` | **248 B** | Minimal event emitter |
| `crossbus` | **32 KB** | Full cross-context + causal ordering |
| `crossbus/plugins/*` | Lazy | Retry, Circuit Breaker, Schema Validation |

---

*CrossBus: The nervous system for your agentic applications.*

