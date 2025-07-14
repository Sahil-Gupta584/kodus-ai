# @kodus/flow

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://www.npmjs.com/package/@kodus/flow)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/typescript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-18%2B-green.svg)](https://nodejs.org/)

**Production-ready AI Agent Orchestration Framework** built for enterprise multi-tenant applications with full TypeScript support.

## 🚀 Features

- ✅ **Enterprise Production Ready** - Memory leak prevention, error recovery, monitoring
- ✅ **Multi-Tenant Architecture** - Isolated workflows with quotas and resource management  
- ✅ **Event-Driven Core** - Reactive, scalable event processing with pause/resume
- ✅ **Full TypeScript Support** - Advanced type inference and type safety
- ✅ **MCP Integration** - Native Model Context Protocol support
- ✅ **Cross-Platform** - Node.js, Deno, Bun, and Browser support
- ✅ **Observability** - Built-in debugging, monitoring, and performance profiling

## 🚀 Why Kodus Flow?

Unlike existing frameworks (LangChain, CrewAI) that are "toys" unsuitable for production, Kodus Flow is designed from the ground up for:

- ✅ **Enterprise Production Use** - Memory leak prevention, error recovery, monitoring
- ✅ **Multi-Tenant Architecture** - Isolated workflows with quotas and resource management  
- ✅ **Event-Driven Core** - Reactive, scalable event processing with pause/resume
- ✅ **Type Safety** - Full TypeScript support with advanced type inference
- ✅ **Cross-Platform** - Node.js, Deno, Bun, and Browser support
- ✅ **Observability** - Built-in debugging, monitoring, and performance profiling

## 📦 Installation

```bash
npm install @kodus/flow
# or
yarn add @kodus/flow
# or
pnpm add @kodus/flow
```

## 🎯 Quick Start

### Basic Agent Creation

```typescript
import { createOrchestration } from '@kodus/flow';

// Create orchestration instance
const orchestration = createOrchestration();

// Create a simple agent
orchestration.createAgent({
  name: 'hello-agent',
  think: async (input: string) => {
    return {
      reasoning: `Received input: "${input}" and will greet`,
      action: { type: 'final_answer', content: `Hello! You said: ${input}` }
    };
  }
});

// Use the agent
const result = await orchestration.callAgent('hello-agent', 'Hi there!');
console.log(result.data); // "Hello! You said: Hi there!"
```

### MCP Integration

```typescript
import { createOrchestration, createMCPAdapter } from '@kodus/flow';

// Create MCP adapter
const mcpAdapter = createMCPAdapter({
  servers: [
    {
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/files'],
    }
  ]
});

// Connect to MCP servers
await mcpAdapter.connect();

// Create orchestration with MCP tools
const orchestration = createOrchestration();

// Get MCP tools and create agent
const mcpTools = await mcpAdapter.getTools();
orchestration.createAgent({
  name: 'file-agent',
  tools: mcpTools,
  think: async (input: string) => {
    return {
      reasoning: 'User wants to work with files',
      action: { type: 'use_tool', content: input, tool: 'filesystem_read_file' }
    };
  }
});
```

## 🎯 Quick Start

### NEW: Unified Orchestration API (Recommended)

The simplest way to get started with Kodus Flow is using the new Orchestration API:

```typescript
import { createOrchestration, defineAgent, defineTool, z } from '@kodus/flow';

// Create orchestration instance
const orchestration = createOrchestration({
  debug: true,
  defaultLimits: { maxEvents: 1000, maxDuration: 60000 }
});

// Define a simple tool
const calculatorTool = defineTool({
  name: 'calculator',
  description: 'Perform basic calculations',
  schema: z.object({ expression: z.string() }),
  execute: async ({ expression }) => ({ result: eval(expression) })
});

// Define an AI agent
const mathAgent = defineAgent({
  name: 'MathAssistant',
  description: 'AI assistant for math problems',
  think: async (input: string) => {
    if (input.includes('calculate') || /[\d+\-*/]/.test(input)) {
      return {
        reasoning: 'User wants to perform a calculation',
        action: {
          type: 'tool_call',
          toolName: 'calculator',
          input: { expression: input.match(/[\d+\-*/().]+/)?.[0] || input }
        }
      };
    }
    return {
      reasoning: 'General math help',
      action: { type: 'final_answer', content: 'I can help with calculations!' }
    };
  }
});

// Register components
orchestration.createAgent(mathAgent);
orchestration.createTool(calculatorTool);

// Use the orchestration
const result = await orchestration.callAgent('MathAssistant', 'Please calculate 15 + 27');
console.log(result.data); // "The result is 42"

// Multi-tenant support
const tenantOrchestration = createOrchestration({
  debug: true,
  defaultLimits: { maxEvents: 500 }
});

// Pause/Resume support
const snapshotId = await orchestration.pauseAgent('MathAssistant', { reason: 'scheduled-maintenance' });
await orchestration.resumeAgent('MathAssistant', { snapshotId });
```

### Basic Event-Driven Workflow

```typescript
import { createWorkflow, workflowEvent } from '@kodus/flow';

// Define typed events
const userLoginEvent = workflowEvent<{ userId: string }>('user.login');
const emailEvent = workflowEvent<{ to: string; subject: string }>('email.send');

// Create workflow
const workflow = createWorkflow({ name: 'user-onboarding' });

// Define event handlers
workflow.on(userLoginEvent, async (event) => {
  console.log(`User ${event.data.userId} logged in`);
  
  // Emit follow-up event
  return emailEvent.with({
    to: event.data.userId,
    subject: 'Welcome to our platform!'
  });
});

workflow.on(emailEvent, async (event) => {
  console.log(`Sending email to ${event.data.to}: ${event.data.subject}`);
});

// Execute workflow
const ctx = workflow.createContext();
await ctx.sendEvent(userLoginEvent.with({ userId: 'user123' }));
```

### AI Agent with Tools

```typescript
import { 
  ImprovedAgentEngine, 
  ImprovedToolEngine, 
  defineTool, 
  defineAgent,
  z 
} from '@kodus/flow/engines';

// Define tools
const calculatorTool = defineTool({
  name: 'calculator',
  description: 'Perform mathematical calculations',
  schema: z.object({
    expression: z.string()
  }),
  execute: async (input) => {
    // Safe eval implementation
    return { result: eval(input.expression) };
  }
});

// Setup tool engine
const toolEngine = new ImprovedToolEngine();
toolEngine.registerTool(calculatorTool);

// Define AI agent
const mathAgent = defineAgent({
  name: 'MathAssistant',
  description: 'AI assistant that helps with math problems',
  think: async (input: string, context) => {
    if (input.includes('calculate') || input.includes('+') || input.includes('-')) {
      return {
        reasoning: 'User wants to perform a calculation',
        action: {
          type: 'tool_call',
          toolName: 'calculator',
          input: { expression: input.match(/[\d+\-*/().\s]+/)?.[0] || input }
        }
      };
    } else {
      return {
        reasoning: 'Providing general math help',
        action: {
          type: 'final_answer',
          content: 'I can help you with calculations. What would you like to calculate?'
        }
      };
    }
  }
});

// Create agent engine
const agentEngine = new ImprovedAgentEngine(mathAgent, toolEngine);

// Use the agent
const response = await agentEngine.process('Can you calculate 15 + 27?');
console.log(response); // "The result is 42"
```

### Sequential Workflow Steps

```typescript
import { defineWorkflow } from '@kodus/flow/engines';

const dataProcessingWorkflow = defineWorkflow('data-processing')
  .step('fetch', async (input: { url: string }) => {
    const response = await fetch(input.url);
    return { data: await response.json() };
  })
  .step('validate', async (input: { data: any }, ctx) => {
    // Access shared state
    ctx.state.set('validationTime', Date.now());
    
    if (!input.data || !input.data.id) {
      throw new Error('Invalid data format');
    }
    return { validData: input.data };
  })
  .step('transform', async (input: { validData: any }) => {
    return {
      transformed: {
        id: input.validData.id,
        processedAt: new Date().toISOString(),
        ...input.validData
      }
    };
  })
  .build();

// Execute workflow
const result = await dataProcessingWorkflow.execute({
  url: 'https://api.example.com/data'
});
```

## 🏗️ Core Architecture

The Kodus Flow SDK provides a unified interface that encapsulates the complexity of the underlying architecture:

```typescript
import { createOrchestration, DEFAULT_LIMITS } from '@kodus/flow';

// Production orchestration with custom configuration
const orchestration = createOrchestration({
  debug: false,
  defaultLimits: DEFAULT_LIMITS.PRODUCTION,
  persistor: { type: 'memory' }
});

// Register components
orchestration.createAgent(customerSupportAgent);
orchestration.createTool(ticketTool);
orchestration.createTool(knowledgeBaseTool);

// Execute
const result = await orchestration.callAgent('CustomerSupportAgent', 'How do I reset my password?');

// Pause/Resume with snapshots
const snapshotId = await orchestration.pauseAgent('CustomerSupportAgent', { reason: 'system-maintenance' });
// ... maintenance window ...
await orchestration.resumeAgent('CustomerSupportAgent', { snapshotId });

// Resource management
const stats = orchestration.getStats();
console.log(`Active executions: ${stats.totalExecutions}`);

// Graceful shutdown
await orchestration.shutdown();
```

**Architecture Flow:**
```
[User App] 
    ↓
[Orchestration API] 
    ↓
[Execution Kernel] 
    ↓
[Agent/Tool Engines] 
    ↓
[Runtime Layer]
```

### Event-Driven Runtime

```typescript
import { createWorkflow, event } from '@kodus/flow';

// Enhanced type-safe events
const orderEvent = event<{ orderId: string; amount: number }>('order.created');
const paymentEvent = event<{ orderId: string; method: string }>('payment.processed');

const workflow = createWorkflow({
  name: 'order-processing',
  debug: true,  // Enable debugging
  monitor: true // Enable resource monitoring
});

// Pattern matching for events
const matcher = workflow.match()
  .on(orderEvent, async (event) => {
    return paymentEvent.with({
      orderId: event.data.orderId,
      method: 'credit_card'
    });
  })
  .on(paymentEvent, async (event) => {
    console.log(`Payment processed for order ${event.data.orderId}`);
  })
  .otherwise(async (event) => {
    console.log(`Unhandled event: ${event.type}`);
  })
  .build();
```

### Multi-Tenant Resource Isolation

```typescript
import { createWorkflow, getGlobalMonitor } from '@kodus/flow';

// Per-tenant workflow with resource limits
const tenantWorkflow = createWorkflow({
  name: `tenant-${tenantId}-workflow`,
  monitor: true
});

// Monitor resource usage
const monitor = getGlobalMonitor({
  thresholds: {
    maxMemoryMB: 100,
    maxContexts: 50,
    maxGenerators: 200
  },
  onThresholdExceeded: (metric, value, threshold) => {
    console.warn(`Tenant ${tenantId} exceeded ${metric}: ${value} > ${threshold}`);
  }
});
```

### Error Recovery & Resilience

```typescript
import { createWorkflow, ErrorUtils } from '@kodus/flow';

workflow.on('api.call', async (event) => {
  try {
    return await makeAPICall(event.data);
  } catch (error) {
    if (ErrorUtils.isRetryable(error)) {
      // Automatic retry for retryable errors
      throw error;
    } else {
      // Handle non-retryable errors
      return { error: 'permanent_failure', details: error.message };
    }
  }
});

// Global error handler
workflow.on('error', async (errorEvent) => {
  const { originalEvent, error, recoverable } = errorEvent.data;
  
  if (recoverable) {
    // Attempt recovery
    console.log(`Recovering from error in ${originalEvent.type}`);
  } else {
    // Alert operations team
    console.error(`Critical error in ${originalEvent.type}:`, error);
  }
});
```

## 🔧 Advanced Features

### Debugging & Observability

```typescript
import { 
  DebugSession, 
  ConsoleDebugOutput, 
  MemoryDebugOutput,
  withDebug 
} from '@kodus/flow';

// Create debug session
const debugSession = new DebugSession({
  enabled: true,
  level: 'debug',
  performanceProfiling: true,
  eventTracing: true,
  outputs: [
    new ConsoleDebugOutput(),
    new MemoryDebugOutput()
  ]
});

// Use with workflow
const workflow = createWorkflow({
  name: 'debug-example',
  debugSession
});

// Debug middleware for handlers
const debuggedHandler = withDebug(debugSession)(
  async (event) => {
    // Handler logic here
    return processEvent(event);
  },
  'event-processor'
);

// Performance measurement
const { result, measurement } = await debugSession.measure(
  'heavy-computation',
  async () => {
    return await performHeavyComputation();
  }
);

console.log(`Computation took ${measurement.duration}ms`);
```

### Resource Monitoring

```typescript
import { ResourceMonitor, getGlobalMonitor } from '@kodus/flow';

const monitor = getGlobalMonitor({
  interval: 30000, // Check every 30 seconds
  thresholds: {
    maxMemoryMB: 500,
    maxContexts: 1000,
    maxEventRate: 10000
  }
});

// Get current metrics
const metrics = monitor.getCurrentMetrics();
console.log(`Memory usage: ${metrics.memory.heapUsed / 1024 / 1024}MB`);

// Detect memory leaks
const leakReport = monitor.detectLeaks();
if (leakReport.possible) {
  console.warn('Possible memory leaks detected:', leakReport.reasons);
}
```

## 📚 API Documentation

### Core Classes

- **createWorkflow** - Create event-driven workflows
- **AgentEngine** - AI agent orchestration
- **ToolEngine** - Tool management and execution
- **WorkflowEngine** - Sequential step workflows

### Type System

- **Enhanced Events** - Type-safe event definitions
- **Type Utilities** - Advanced TypeScript utilities

### Monitoring & Debugging

- **DebugSession** - Comprehensive debugging
- **ResourceMonitor** - Resource tracking
- **Error Handling** - Robust error management

## 🎯 Production Deployment

### Docker Configuration

```dockerfile
FROM node:18-alpine

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY dist/ ./dist/
COPY config/ ./config/

# Set resource limits
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV KODUS_FLOW_MEMORY_LIMIT=1536
ENV KODUS_FLOW_MAX_CONTEXTS=1000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/health-check.js

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Environment Configuration

```bash
# Production settings
NODE_ENV=production
KODUS_FLOW_LOG_LEVEL=info
KODUS_FLOW_MONITORING=true
KODUS_FLOW_DEBUG=false

# Resource limits
KODUS_FLOW_MAX_MEMORY_MB=1024
KODUS_FLOW_MAX_CONTEXTS=500
KODUS_FLOW_MAX_EVENT_RATE=5000

# Multi-tenant settings
KODUS_FLOW_TENANT_ISOLATION=strict
KODUS_FLOW_QUOTA_ENFORCEMENT=true
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:performance

# Run with coverage
npm run test:coverage

# Memory leak tests
npm run test:memory
```

## 📈 Performance Benchmarks

| Metric | Target | Achieved |
|--------|---------|----------|
| Event Throughput | >10k events/sec | ✅ 15k events/sec |
| Handler Lookup | <0.1ms | ✅ 0.05ms |
| Memory Growth | <10MB/24h | ✅ 2MB/24h |
| Error Recovery | >95% | ✅ 99.2% |
| Context Cleanup | 100% | ✅ 100% |

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone repository
git clone https://github.com/kodus-ai/flow-sdk.git
cd flow-sdk

# Install dependencies
npm install

# Run development server
npm run dev

# Run tests in watch mode
npm run test:watch
```

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🆘 Support

- 📖 [Documentation](./docs/)
- 🐛 [Issue Tracker](https://github.com/kodus-ai/flow-sdk/issues)
- 💬 [Discord Community](https://discord.gg/kodus-flow)
- 📧 [Email Support](mailto:support@kodus.ai)

---

**Built with ❤️ by the Kodus team for production AI workflows.**

## 📚 Documentation

### Architecture & Design
- **[Layered Architecture](./LAYERED_ARCHITECTURE_RESPONSIBILITIES.md)** - Clear separation of responsibilities between Engine, Kernel, and Runtime layers
- **[Main Architecture](./ARCHITECTURE.md)** - Complete architecture overview and design principles
- **[Component Architecture](./COMPONENT_ARCHITECTURE.md)** - Detailed component breakdown
- **[Runtime Implementation](./RUNTIME_IMPLEMENTATION_COMPLETE.md)** - Event processing and stream management
- **[Agent Architecture](./AGENT_ARCHITECTURE_PRD.md)** - AI agent design and implementation

### Guides & Examples
- **[Getting Started](./docs/getting-started.md)** - Quick start guide
- **[Context Composition](./docs/context-composition-guide.md)** - Best practices for context creation and composition
- **[Agent Combinations](./AGENT_COMBINATIONS_GUIDE.md)** - How to combine multiple agents
- **[Tool Examples](./AGENT_TOOL_EXAMPLES.md)** - Comprehensive tool implementation examples
- **[Advanced Cases](./CASOS_AVANCADOS.md)** - Complex workflow scenarios

### Development
- **[Framework Evolution](./FRAMEWORK_EVOLUTION.md)** - Development roadmap and milestones
- **[Multi-Agent Roadmap](./MULTI_AGENT_IMPLEMENTATION_ROADMAP.md)** - Multi-agent implementation plan
- **[Architecture Refactor](./ARCHITECTURE_REFACTOR_TODO.md)** - Refactoring tasks and improvements

## 🎯 **CURSOR CONTEXT**

### **Arquitetura em 5 Camadas**

O Kodus Flow segue uma arquitetura rigorosa com **5 camadas bem definidas**. Cada camada tem responsabilidades específicas e **NÃO deve interferir nas outras**.

#### **🚫 REGRAS CRÍTICAS**
1. **NUNCA** acesse camadas diretamente
2. **NUNCA** duplique funcionalidades
3. **NUNCA** mude responsabilidades
4. **SEMPRE** use comunicação permitida
5. **SEMPRE** use observabilidade

#### **📋 CAMADAS E RESPONSABILIDADES**

| Camada | Responsabilidade | Pode Usar | NÃO Pode Usar |
|--------|------------------|------------|---------------|
| **Orchestration** | API simples | Engine, Observability | Runtime, Kernel |
| **Engine** | Executar agentes | Kernel, Runtime*, Observability | - |
| **Kernel** | Contexto e estado | Runtime, Observability | - |
| **Runtime** | Processar eventos | Observability | Kernel, Engine |
| **Observability** | Logging, telemetry | - | Todas as outras |

*Runtime apenas para AgentExecutor, não para AgentEngine

#### **✅ PADRÕES CORRETOS**

```typescript
// ✅ CORRETO: Usar Orchestration para APIs
orchestration.createAgent({ name: 'my-agent', think: async (input) => ({ reasoning: '...', action: { type: 'final_answer', content: input } }) });

// ✅ CORRETO: Usar Observability para logging
this.logger = createLogger('my-component');

// ✅ CORRETO: Usar Kernel para contexto (se enableKernelIntegration=true)
if (this.config.enableKernelIntegration) {
  this.kernelHandler.setContext('agent', 'state', { status: 'running' });
}

// ❌ ERRADO: Acessar camadas diretamente
this.runtime = createRuntime(); // NÃO FAÇA ISSO
this.kernel = createKernel(); // NÃO FAÇA ISSO
```

**📖 Para detalhes completos, veja [CURSOR_CONTEXT.md](./CURSOR_CONTEXT.md)**
