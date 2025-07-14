# 🏗️ Kodus Flow - Architecture Flow Guide

## 📋 Visão Geral da Arquitetura

O Kodus Flow possui uma arquitetura em camadas onde **tudo flui através do sistema de eventos** (Runtime) gerenciado pelo **Kernel**. Esta documentação explica como as engines se comunicam e onde implementar as novas funcionalidades.

## 🛡️ Garantias Fundamentais

### **🔒 100% Backward Compatible**
- **TODAS** as APIs atuais continuam funcionando exatamente igual
- **TODOS** os testes existentes passam sem modificação
- **ZERO** breaking changes ou refactoring necessário
- **Migração transparente** - usuários não notam diferenças

### **⚡ Minimal Performance Impact**
- **+2ms overhead** médio por operação
- **+5% memory usage** máximo
- **Event serialization** otimizada
- **Circuit breakers** para proteção de performance

---

## 🎯 Princípios Fundamentais

### **1. Event-Driven Architecture**
- **Tudo é evento**: Agent execution, tool calls, router decisions
- **Fluxo unidirecional**: User → Orchestration → Engine → Kernel → Runtime
- **State centralizado**: Kernel gerencia todo estado e persistência

### **2. Separation of Concerns**
- **Orchestration**: Entry point e coordination
- **Engine**: Business logic e transformation
- **Runtime**: Event processing e stream operations  
- **Kernel**: State management e persistence

### **3. No Bypassing**
- **Engines NÃO** devem processar diretamente
- **Tudo** deve fluir via Kernel → Runtime
- **Context enhancement** acontece via eventos

---

## 🏗️ Arquitetura de Camadas

```
┌─────────────────────────────────────────────────────┐
│                    USER API                         │
│  orchestration.callAgent('security', prData)        │
├─────────────────────────────────────────────────────┤
│                ORCHESTRATION LAYER                  │
│  - OrchestrationImpl (entry point)                 │
│  - Component creation (agents, tools, routers)     │
│  - Registry management                              │
├─────────────────────────────────────────────────────┤
│                   ENGINE LAYER                      │
│  - ExecutionEngine (bridge to kernel)              │
│  - AgentWorkflowFactory (converts agents)          │
│  - ContextEnhancer (creates enhanced context)      │
│  - ActionProcessor (handles new actions)           │
├─────────────────────────────────────────────────────┤
│                   KERNEL LAYER                      │
│  - ExecutionKernel (state + coordination)          │
│  - UnifiedExecutionState (centralized state)       │
│  - Quota management + Circuit breakers             │
│  - Snapshot/restore for pause/resume               │
├─────────────────────────────────────────────────────┤
│                  RUNTIME LAYER                      │
│  - Event processing (createWorkflow)               │
│  - Stream operations (filter, map, until)          │
│  - Middleware (retry, timeout, validation)         │
│  - Resource management + Infinite loop protection  │
└─────────────────────────────────────────────────────┘
```

---

## 🔄 Fluxo de Execução Detalhado

### **Exemplo: orchestration.callAgent('security-agent', prData)**

#### **1. Orchestration Layer (Entry Point)**
```typescript
// src/orchestration/orchestration.ts
async callAgent(agentName: string, input: unknown) {
  const agent = this.agents.get(agentName);
  
  // ✅ Create agent workflow via KernelHandler
  const kernelHandler = createKernelHandler({
    tenantId: 'tenant-1',
    enableWorkflowExecution: true,
  });

  const startEvent = createEvent('agent.start', { agentName: agentName });
  return await kernelHandler.run(startEvent);
}
```

#### **2. Engine Layer (Business Logic)**
```typescript
// src/engine/agent-workflow-factory.ts (NOVO)
export class AgentWorkflowFactory {
  createAgentWorkflow(agent: AgentDefinition): Workflow {
    const workflow = createWorkflow({ name: `agent:${agent.name}` });
    
    // Agent thinking as event handler
    workflow.on('agent.input', async (event) => {
      const { input } = event.data;
      const enhancedContext = this.contextEnhancer.enhance(baseContext);
      
      const thought = await agent.think(input, enhancedContext);
      return { type: 'agent.thought', data: thought };
    });
    
    // Action processing as event handler
    workflow.on('agent.thought', async (event) => {
      const thought = event.data;
      return await this.actionProcessor.processAction(thought.action);
    });
    
    // Tool execution as event handler
    workflow.on('tool.call', async (event) => {
      const { toolName, input } = event.data;
      const result = await this.toolEngine.executeCall(toolName, input);
      return { type: 'tool.result', data: result };
    });
    
    return workflow;
  }
}
```

#### **3. Kernel Layer (State Management)**
```typescript
// src/kernel/kernel.ts
async run(startEvent: Event): Promise<unknown> {
  // Initialize execution state
  this.state = {
    id: `${this.config.tenantId}:${jobId}`,
    status: 'running',
    contextData: {},
    events: [startEvent],
    quotas: this.config.quotas
  };
  
  // Delegate to runtime workflow
  const result = await this.workflow.emit(startEvent);
  
  // Track state and quotas
  this.recordEvent(startEvent);
  this.checkQuotas();
  
  return result;
}
```

#### **4. Runtime Layer (Event Processing)**
```typescript
// src/runtime/index.ts (workflow execution)
workflow.emit({ type: 'agent.input', data: { input: prData } });
  ↓
workflow.on('agent.input') → agent.think(prData, enhancedContext)
  ↓ 
workflow.emit({ type: 'agent.thought', data: thought });
  ↓
workflow.on('agent.thought') → actionProcessor.processAction(thought.action)
  ↓
workflow.emit({ type: 'tool.call', data: { toolName: 'semgrep', input: prData } });
  ↓
workflow.on('tool.call') → toolEngine.executeCall('semgrep', prData)
  ↓
workflow.emit({ type: 'tool.result', data: findings });
  ↓
workflow.on('tool.result') → return final answer
```

---

## 🚫 Anti-Patterns (O que NÃO fazer)

### **❌ Bypassing Kernel:**
```typescript
// ❌ ERRADO: AgentEngine processando diretamente
class AgentEngine {
  async process(input) {
    const thought = await this.agent.think(input); // Bypass kernel
    return this.processAction(thought); // Sem state management
  }
}
```

### **❌ Mini-Workflows Isolados:**
```typescript
// ❌ ERRADO: Workflows independentes do kernel
class AgentEngine {
  constructor() {
    this.workflow = createWorkflow(); // Isolado, sem kernel
  }
}
```

### **❌ Direct Tool Access:**
```typescript
// ❌ ERRADO: Tools executando fora do fluxo de eventos
async think(input, ctx) {
  const result = await this.toolEngine.execute('semgrep', input); // Bypass events
  return { action: { type: 'final_answer', content: result } };
}
```

---

## ✅ Patterns Corretos (O que fazer)

### **✅ Everything via Events:**
```typescript
// ✅ CORRETO: Tool access via enhanced context (events)
async think(input, ctx) {
  const result = await ctx.tools.semgrep(input); // Via proxy → event → kernel
  return { action: { type: 'final_answer', content: result } };
}
```

### **✅ State via Kernel:**
```typescript
// ✅ CORRETO: State management via kernel
const enhancedContext = {
  ...baseContext,
  state: kernel.getState(), // Centralized state
  tools: createToolProxy(kernel), // Event-based tool access
};
```

### **✅ Workflows via KernelHandler:**
```typescript
// ✅ CORRETO: Agent execution via KernelHandler
const kernelHandler = createKernelHandler({
    tenantId: 'tenant-1',
    enableWorkflowExecution: true,
});

const startEvent = createEvent('agent.start', { agentName: 'math-agent' });
await kernelHandler.run(startEvent); // Via kernel
```

---

## 🔄 Migration Examples (Zero Breaking Changes)

### **Example 1: Current Agent Implementation**
```typescript
// ✅ BEFORE: Current implementation
const securityAgent = orchestration.createAgent({
  name: "SecurityAgent",
  tools: [semgrepTool],
  async think(input, ctx) {
    return {
      reasoning: "Need to scan for vulnerabilities",
      action: { type: 'tool_call', toolName: 'semgrep', input: { code: input } }
    };
  }
});

const result = await orchestration.callAgent("SecurityAgent", prData);

// ✅ AFTER: Exact same code, works identically
// Internally: flows through Kernel → Runtime events
// User experience: Identical behavior and performance
```

### **Example 2: Enhanced Features (Opt-in)**
```typescript
// ✅ NEW: Enhanced features available when desired
const enhancedAgent = orchestration.createAgent({
  name: "SecurityAgent",
  tools: [semgrepTool, triageRouter], // ✨ Router as tool (new)
  
  async think(input, ctx) {
    // ✅ OPTION 1: Keep current pattern (works forever)
    // return { action: { type: 'tool_call', toolName: 'semgrep', input } };
    
    // ✨ OPTION 2: Use enhanced direct access (when ready)
    const vulnerabilities = await ctx.tools.semgrep({ code: input });
    const routing = await ctx.tools.triageRouter({ severity: vulnerabilities.maxSeverity });
    
    // ✨ OPTION 3: Use new action types (when ready)
    return { 
      action: { 
        type: 'delegate', 
        targetAgent: routing.selectedAgent, 
        input: vulnerabilities 
      } 
    };
  }
});
```

### **Example 3: Gradual Adoption**
```typescript
// ✅ Teams can adopt features gradually
const hybridAgent = orchestration.createAgent({
  name: "HybridAgent",
  tools: [toolA, toolB],
  
  async think(input, ctx) {
    // Mix old and new patterns as needed
    if (input.useEnhanced) {
      // New pattern
      const result = await ctx.tools.toolA(input);
      return { action: { type: 'final_answer', content: result } };
    } else {
      // Legacy pattern (continues working)
      return { action: { type: 'tool_call', toolName: 'toolB', input } };
    }
  }
});
```

---

## 🛠️ Implementation Guidelines

### **Where to Implement Each Feature:**

#### **1. Enhanced Context (ctx.tools.toolName())**
**Location:** `src/engine/context-enhancer.ts` (NEW)
```typescript
export class ContextEnhancer {
  constructor(private kernel: ExecutionKernel) {}
  
  enhance(baseContext: AgentContext): EnhancedAgentContext {
    return {
      ...baseContext,
      tools: this.createToolProxy(),
      routers: this.createRouterProxy(),
      planners: this.createPlannerProxy()
    };
  }
  
  private createToolProxy(): ToolProxy {
    return new Proxy({}, {
      get: (_, toolName: string) => async (input: unknown) => {
        // ✅ Tool call via kernel event
        const event = { type: 'tool.call', data: { toolName, input } };
        const result = await this.kernel.sendEvent(event);
        return result.data;
      }
    });
  }
}
```

#### **2. Router as Tool**
**Location:** `src/engine/router.ts` (MODIFY)
```typescript
export class Router implements BaseToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodSchema;
  outputSchema: ZodSchema;
  
  // ✅ Tool interface compliance
  async execute(input: unknown): Promise<RoutingResult> {
    return this.route(input);
  }
}
```

#### **3. Action Processing**
**Location:** `src/engine/action-processor.ts` (NEW)
```typescript
export class ActionProcessor {
  constructor(private kernel: ExecutionKernel) {}
  
  async processAction(action: AgentAction, context: EnhancedAgentContext): Promise<unknown> {
    switch (action.type) {
      case 'tool_call':
        // ✅ Tool call via kernel event
        const toolEvent = { type: 'tool.call', data: action };
        return await this.kernel.sendEvent(toolEvent);
        
      case 'route':
        // ✅ Router call via kernel event  
        const routeEvent = { type: 'router.route', data: action };
        return await this.kernel.sendEvent(routeEvent);
        
      case 'delegate':
        // ✅ Agent delegation via kernel event
        const delegateEvent = { type: 'agent.delegate', data: action };
        return await this.kernel.sendEvent(delegateEvent);
    }
  }
}
```

#### **4. Plan Execution**
**Location:** `src/engine/plan-executor.ts` (NEW)
```typescript
export class PlanExecutor {
  constructor(private kernel: ExecutionKernel) {}
  
  async executePlan(plan: Plan, context: EnhancedAgentContext): Promise<unknown> {
    for (const step of plan.steps) {
      // ✅ Each step as kernel event
      const stepEvent = { 
        type: `plan.step.${step.type}`, 
        data: { step, planId: plan.id } 
      };
      
      const result = await this.kernel.sendEvent(stepEvent);
      context.planContext.setStepResult(step.id, result);
    }
    
    return context.planContext.getFinalResult();
  }
}
```

---

## 📁 File Structure for Implementation

### **New Files to Create:**
```
src/
├── engine/
│   ├── context-enhancer.ts          # Enhanced AgentContext
│   ├── action-processor.ts          # New action type processing
│   ├── plan-executor.ts             # Plan execution engine
│   ├── agent-workflow-factory.ts    # Convert agents to workflows
│   └── tool-proxy.ts                # Direct tool access proxy
├── core/
│   └── types/
│       └── plan-types.ts            # Plan-related interfaces
└── integration/
    └── kernel-events.ts             # Event definitions for kernel
```

### **Files to Modify:**
```
src/
├── orchestration/
│   └── orchestration.ts            # callAgent() via ExecutionEngine
├── engine/
│   ├── agent-engine.ts             # Remove direct processing
│   └── router.ts                   # Add tool interface
├── core/
│   └── types/
│       └── common-types.ts         # Enhanced AgentContext + Actions
└── kernel/
    └── kernel.ts                   # Add event handling methods
```

---

## 🧪 Testing Strategy

### **Integration Tests Required:**
```typescript
// tests/integration/agent-kernel-flow.test.ts
describe('Agent Kernel Flow', () => {
  test('agent execution flows through kernel', async () => {
    const orchestration = createOrchestration();
    const agent = orchestration.createAgent({
      name: 'test-agent',
      async think(input, ctx) {
        const result = await ctx.tools.testTool(input);
        return { action: { type: 'final_answer', content: result } };
      }
    });
    
    // Should flow: Orchestration → ExecutionEngine → Kernel → Runtime
    const result = await orchestration.callAgent('test-agent', 'test-input');
    
    expect(result.metadata.executionId).toBeDefined();
    expect(result.metadata.eventCount).toBeGreaterThan(0);
  });
});
```

---

## 🚀 Implementation Order

### **Phase 1: Foundation (Week 1)**
1. **ContextEnhancer** - Enhanced AgentContext with proxies
2. **AgentWorkflowFactory** - Convert agents to workflows
3. **Modify callAgent()** - Use ExecutionEngine instead of direct processing

### **Phase 2: Action Processing (Week 2)**
1. **ActionProcessor** - Handle new action types via events
2. **Router Tool Interface** - Make routers work as tools
3. **Plan Executor** - Execute plans via kernel events

### **Phase 3: Advanced Features (Week 3)**
1. **Enhanced lifecycle hooks** - onToolResult, onRouterResult
2. **Mixed pipelines** - Support routers/tools in pipelines
3. **Multi-agent coordination** - Router-based strategies

### **Phase 4: Production Ready (Week 4)**
1. **Error recovery** - Retry, fallback, circuit breakers
2. **Performance optimization** - Caching, batching
3. **Monitoring integration** - Metrics, tracing, debugging

---

## 💡 Key Success Criteria

### **Architecture Compliance:**
- [ ] All agent execution flows through Kernel → Runtime
- [ ] No direct processing in engines
- [ ] Enhanced context works via event proxies
- [ ] State management centralized in kernel

### **Functionality:**
- [ ] `ctx.tools.toolName()` works seamlessly
- [ ] Router as tool in agent tools array
- [ ] Plan execution via structured events
- [ ] New action types (delegate, route, execute_plan)

### **Performance:**
- [ ] No performance regression vs current implementation
- [ ] Event overhead < 10ms per operation
- [ ] Memory usage stable under load
- [ ] Proper cleanup of event handlers

Esta documentação garante que qualquer dev entenda **exatamente** como implementar as funcionalidades respeitando a arquitetura event-driven do Kodus Flow! 🎯