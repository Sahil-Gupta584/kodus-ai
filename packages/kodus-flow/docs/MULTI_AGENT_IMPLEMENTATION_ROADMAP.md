# 🗺️ **MULTI-AGENT EVENT-DRIVEN IMPLEMENTATION ROADMAP**

## 📋 **OVERVIEW**

Roadmap completo para implementar **Multi-Agent Coordination** no Kodus Flow usando arquitetura **event-driven**. Este documento define **exatamente** o que fazer, quando fazer, quem pode fazer, e como distribuir o trabalho entre devs.

### **🎯 OBJETIVO PRINCIPAL:**
Transformar agents de **execução isolada** para **coordenação multi-agent** via eventos, mantendo **100% backward compatibility**.

---

## ✅ **STATUS ATUAL - P1-P2 MAJOR PROGRESS!**

### **🏗️ Foundation Estabelecida:**
- ✅ **AgentWorkflowFactory Enhanced** - Base sólida implementada
- ✅ **Event-driven Architecture** - Agent execution via Kernel → Runtime 
- ✅ **Performance Optimization** - Context caching + timeout management
- ✅ **Error Handling Integration** - SDK-compliant errors + observability
- ✅ **Testability & Maintainability** - Dependency injection + separated handlers
- ✅ **Extensibility Foundation** - Plugin system + action registry

### **🎯 Multi-Agent Core Implementado:**
- ✅ **ContextEnhancer** - Enhanced context com `ctx.tools.toolName()` ready
- ✅ **Enhanced Action Types** - 8 novos action types (delegate, collaborate, route, plan, pause, broadcast, discover, sync_state)
- ✅ **AgentExecutor** - Real agent execution via workflow (RealAgentExecutor + InMemoryAgentLookup)
- ✅ **StateSyncHandler** - State synchronization entre agents com merge strategies (replace, merge, append)
- ✅ **EventSubscriptionManager** - Event subscription com pattern matching e wildcards
- ✅ **RouterHandler** - Sistema de roteamento inteligente (v1 - refactoring para híbrido)
- ✅ **AgentDelegationHandler** - Agent-to-agent delegation com chain tracking

### **🚪 Portas Abertas:**
- **Enhanced Context** IMPLEMENTADO - `ctx.tools.toolName()` funcional
- **Action Registry** IMPLEMENTADO - 8 novos action types funcionando
- **Multi-Agent Communication** IMPLEMENTADO - delegation, state sync, event subscription  
- **Real Agent Execution** IMPLEMENTADO - workflows reais vs mocks
- **Router System** IMPLEMENTADO - roteamento inteligente (v1)

---

## 🗺️ **ROADMAP ESTRUTURADO**

### **📋 PHASE 0: Foundation (✅ COMPLETED)**
*Base sólida para multi-agent features*

| Task | Status | Dev | Dependência | Tempo | Prioridade |
|------|--------|-----|-------------|-------|------------|
| **P0.1** - Enhanced AgentWorkflowFactory | ✅ DONE | Dev1 | Nenhuma | 2 dias | 🔴 CRÍTICA |
| **P0.2** - ContextEnhancer | 🟡 NEXT | Dev2 | P0.1 | 2 dias | 🔴 CRÍTICA |
| **P0.3** - Enhanced Action Types | 🟡 READY | Dev3 | Nenhuma | 1 dia | 🔴 CRÍTICA |
| **P0.4** - ActionProcessor | 🟡 READY | Dev1 | P0.3 | 1 dia | 🔴 CRÍTICA |

**Objetivo:** Componentes base para enhanced agents

---

### **📋 PHASE 1: Enhanced Agent Experience (✅ COMPLETED)**  
*Enhanced context + direct tool access*

| Task | Status | Dev | Dependência | Tempo | Prioridade |
|------|--------|-----|-------------|-------|------------|
| **P1.1** - Implementar ContextEnhancer | ✅ DONE | Dev2 | P0.1 | 2 dias | 🔴 CRÍTICA |
| **P1.2** - Direct Tool Access (ctx.tools.toolName()) | ✅ DONE | Dev2 | P1.1 | 1 dia | 🔴 CRÍTICA |
| **P1.3** - Enhanced Action Types (delegate, collaborate) | ✅ DONE | Dev3 | P0.3 | 1 dia | 🔴 CRÍTICA |
| **P1.4** - ActionProcessor Integration | ✅ DONE | Dev1 | P1.3 | 1 dia | 🔴 CRÍTICA |

**Objetivo:** ✅ `ctx.tools.toolName()` + enhanced actions funcionando

---

### **📋 PHASE 2: Agent-to-Agent Communication (✅ COMPLETED)**
*Agents podem comunicar e coordenar*

| Task | Status | Dev | Dependência | Tempo | Prioridade |
|------|--------|-----|-------------|-------|------------|
| **P2.1** - Agent Discovery System (EcosystemHandler) | ✅ DONE | Dev4 | P1.4 | 2 dias | 🟡 ALTA |
| **P2.2** - Agent Delegation (`type: 'delegate'`) | ✅ DONE | Dev1 | P1.3 | 2 dias | 🟡 ALTA |
| **P2.3** - State Synchronization (`type: 'sync_state'`) | ✅ DONE | Dev2 | P2.2 | 2 dias | 🟡 ALTA |
| **P2.4** - Router System (RouterHandler v1) | ✅ DONE | Dev3 | P1.2 | 1 dia | 🟡 ALTA |
| **P2.5** - Event Subscription (EventSubscriptionManager) | ✅ DONE | Dev4 | P2.1 | 1 dia | 🟡 ALTA |
| **P2.6** - Real Agent Execution (RealAgentExecutor) | ✅ DONE | Dev1 | P2.2 | 1 dia | 🟡 ALTA |

**Objetivo:** ✅ Agents podem descobrir, comunicar, sincronizar estado e executar outros agents

---

### **📋 PHASE 3: Multi-Agent Coordination (🟡 IN PROGRESS)**
*Workflows complexos multi-agent*

| Task | Status | Dev | Dependência | Tempo | Prioridade |
|------|--------|-----|-------------|-------|------------|
| **P3.1** - Router Híbrido (regras declarativas + load balancing) | 🟡 NEXT | Dev3 | P2.4 | 1 dia | 🔴 CRÍTICA |
| **P3.2** - Planner Handler (ctx.plan() + CoT/ToT/Graph) | 🟡 READY | Dev2 | P2.* | 2 dias | 🔴 CRÍTICA |
| **P3.3** - Circuit Breakers (fault tolerance) | ⚪ WAITING | Dev1 | P3.1 | 2 dias | 🟠 MÉDIA |
| **P3.4** - Sequential Multi-Agent Pipelines | ⚪ WAITING | Dev4 | P3.2 | 2 dias | 🟠 MÉDIA |
| **P3.5** - Parallel Multi-Agent Execution | ⚪ WAITING | Dev1 | P3.2 | 2 dias | 🟠 MÉDIA |
| **P3.6** - Kernel Integration (Real EventKernel vs mock) | ⚪ WAITING | Dev2 | P3.* | 1 dia | 🟢 BAIXA |

**Objetivo:** Complex multi-agent workflows com planning e routing inteligente

---

### **📋 PHASE 4: Reactive & Autonomous Agents (FUTURE)**
*Agents que reagem a eventos e trabalham autonomamente*

| Task | Status | Dev | Dependência | Tempo | Prioridade |
|------|--------|-----|-------------|-------|------------|
| **P4.1** - Reactive Agent Handlers | ⚪ FUTURE | Dev3 | P3.* | 3 dias | 🟢 BAIXA |
| **P4.2** - Autonomous Agent Lifecycle | ⚪ FUTURE | Dev1 | P4.1 | 2 dias | 🟢 BAIXA |
| **P4.3** - Agent State Persistence | ⚪ FUTURE | Dev2 | P4.1 | 2 dias | 🟢 BAIXA |
| **P4.4** - Global Event Bus Integration | ⚪ FUTURE | Dev4 | P4.1 | 3 dias | 🟢 BAIXA |

**Objetivo:** Fully autonomous multi-agent ecosystem

---

## 📈 **IMPLEMENTAÇÃO ATUAL - DETALHES TÉCNICOS**

### **✅ ContextEnhancer (P1.1) - IMPLEMENTADO**
**File:** `src/engine/context-enhancer.ts`

```typescript
// Enhanced context com direct tool access
const context = contextEnhancer.enhance(baseContext);
await context.tools.semgrep(code);        // Direct tool calls
await context.agents.securityAgent(data); // Direct agent delegation  
await context.ecosystem.discover({ domain: 'security' }); // Agent discovery
```

**Funcionalidades:**
- ✅ `ctx.tools.toolName()` - Direct tool access via proxy
- ✅ `ctx.agents.agentName()` - Direct agent delegation via proxy
- ✅ `ctx.ecosystem.discover()` - Agent discovery integration
- ✅ Backward compatibility mantida 100%

### **✅ Enhanced Action Types (P1.3) - IMPLEMENTADO**  
**File:** `src/core/types/enhanced-action-types.ts`

```typescript
// 8 novos action types implementados
export type MultiAgentAction =
  | { type: 'delegate'; targetAgent: string; input: unknown; reason?: string; }
  | { type: 'collaborate'; agents: string[]; strategy: 'parallel' | 'sequential'; }
  | { type: 'route'; routerName: string; input: unknown; strategy?: string; }
  | { type: 'plan'; plannerName: string; goal: string; context?: unknown; }
  | { type: 'pause'; reason: string; resumeCondition?: unknown; }
  | { type: 'broadcast'; event: string; data: unknown; recipients?: string[]; }
  | { type: 'discover'; criteria: unknown; limit?: number; }
  | { type: 'sync_state'; target: string | string[]; data: unknown; merge?: boolean; };
```

### **✅ AgentExecutor (P2.6) - IMPLEMENTADO**
**File:** `src/engine/agent-executor.ts`

**Real agent execution via workflow:**
- ✅ RealAgentExecutor - Substitui mocks por execução real
- ✅ InMemoryAgentLookup - Registry de agents com workflow mapping
- ✅ Timeout management - 30s default com cancellation
- ✅ Error handling - Proper error propagation
- ✅ Context preservation - CorrelationId e metadata mantidos

### **✅ StateSyncHandler (P2.3) - IMPLEMENTADO**
**File:** `src/engine/state-sync-handler.ts`

**State synchronization entre agents:**
- ✅ Multiple merge strategies: replace, merge, append
- ✅ Conflict detection e resolution
- ✅ Namespace-based state organization
- ✅ Performance monitoring com success rates

```typescript
// Usage example
await agent.sync_state({
  target: ['agent1', 'agent2'],
  data: { analysis: results },
  strategy: 'merge'
});
```

### **✅ EventSubscriptionManager (P2.5) - IMPLEMENTADO**
**File:** `src/engine/event-subscription.ts`

**Event subscription com pattern matching:**
- ✅ Wildcard patterns: `agent.*`, `tool.*.completed`
- ✅ Regex patterns para matching complexo
- ✅ Priority-based handler execution
- ✅ Auto-cleanup e memory management
- ✅ Performance monitoring

```typescript
// Usage example
subscriptionManager.subscribe(
  'securityAgent',
  'agent.delegate.*',
  async (event) => { /* handle delegation */ }
);
```

### **✅ RouterHandler v1 (P2.4) - IMPLEMENTADO** 
**File:** `src/engine/router-handler.ts`

**Sistema de roteamento inteligente:**
- ✅ Multiple routing strategies: round_robin, best_fit, load_based, priority
- ✅ Agent capability tracking com performance metrics
- ✅ Rule-based routing com conditions
- ✅ Confidence scoring para decisões
- ✅ Statistics e monitoring

**🔄 NEXT: Refactoring para versão híbrida (sua visão + load balancing)**

### **✅ AgentDelegationHandler (P2.2) - IMPLEMENTADO**
**File:** `src/engine/agent-delegation-handler.ts`

**Agent-to-agent delegation:**
- ✅ Chain depth tracking (max 5 levels) 
- ✅ Timeout management per delegation
- ✅ Context preservation através da chain
- ✅ Performance statistics
- ✅ Error recovery e fallbacks

### **✅ EcosystemHandler (P2.1) - IMPLEMENTADO**
**File:** `src/engine/ecosystem-handler.ts`

**Agent discovery e registry:**
- ✅ Agent registration com capabilities
- ✅ Discovery by domain, skills, availability
- ✅ Broadcast system para ecosystem events
- ✅ Workload tracking e updates
- ✅ Default agents pre-registered

---

## 🔧 **DETAILED IMPLEMENTATION SPECS**

### **🔄 P3.1: Router Híbrido (NEXT TASK)**

**Objetivo:** Combinar regras declarativas (sua visão) + load balancing inteligente

**Conceito Híbrido:**
```typescript
const smartRouter = createRouter({
  name: 'SmartTriageRouter',
  routes: {
    security: ['security-agent-1', 'security-agent-2'], // Multiple agents
    review: ['review-agent-1', 'review-agent-2']
  },
  // SUA VISÃO: regras declarativas primeiro
  ruleFn: ({ diff, labels }) =>
    diff.match(/\.(ya?ml|Dockerfile)$/) || labels.includes('security')
      ? 'security' : 'review',
  // MINHA ADIÇÃO: fallback inteligente quando há múltiplos agents
  fallbackStrategy: 'load_based' // ou 'round_robin', 'best_fit'
});
```

**Implementation Plan:**
1. Refactor RouterHandler para aceitar `ruleFn` como primary
2. Manter sistema de capabilities para load balancing
3. Debug logs claros: "Rule matched: diff.yaml -> security -> selected: security-agent-1 (load: 20%)"
4. Backward compatibility com routers existentes

### **🔄 P3.2: Planner Handler (READY)**

**Objetivo:** Implementar `ctx.plan()` + estratégias pluggáveis (CoT, ToT, Graph)

**Conceito Híbrido:**
```typescript
const bugFixAgent = createAgent({
  planner: new ToTPlanner({ beamWidth: 5 }), // MINHA ESTRUTURA
  think: async ({ codeSnippet }, ctx) => {
    // SUA INTERFACE SIMPLES
    const plan = await ctx.plan([
      'Identificar linha com erro',
      'Gerar patch sugerido', 
      'Executar testes'
    ]);
    // ctx.plan() usa ToTPlanner internamente
  }
});

// Dynamic switching (SUA VISÃO)
bugFixAgent.setPlanner(new CoTPlanner());
```

**Implementation Plan:**
1. Implementar `ctx.plan()` method no enhanced context
2. CoTPlanner, ToTPlanner, GraphPlanner como strategies
3. Dynamic planner switching
4. Integration com AgentWorkflowFactory

### **P1.1: ContextEnhancer (✅ IMPLEMENTADO)**

**Objetivo:** ✅ Enhanced context que permite `ctx.tools.toolName()` direct access

**File:** `src/engine/context-enhancer.ts`

```typescript
/**
 * Enhanced AgentContext with direct tool/router/planner access
 */
export class ContextEnhancer {
  constructor(
    private kernel: ExecutionKernel,
    private toolEngine: ToolEngine,
    private routerRegistry: RouterRegistry,
    private plannerRegistry: PlannerRegistry
  ) {}
  
  enhance(baseContext: AgentContext): EnhancedAgentContext {
    return {
      ...baseContext,
      
      // ✨ NOVO: Direct tool access
      tools: this.createToolProxy(),
      
      // ✨ NOVO: Router access  
      routers: this.createRouterProxy(),
      
      // ✨ NOVO: Planner access
      planners: this.createPlannerProxy(),
      
      // ✨ NOVO: Agent discovery
      agents: this.createAgentProxy(),
      
      // ✨ NOVO: Global ecosystem
      ecosystem: this.createEcosystemProxy()
    };
  }
  
  private createToolProxy(): ToolProxy {
    return new Proxy({}, {
      get: (_, toolName: string) => async (input: unknown) => {
        const event = { 
          type: 'tool.call', 
          data: { toolName, input },
          ts: Date.now()
        };
        const result = await this.kernel.sendEvent(event);
        return result.data;
      }
    });
  }
  
  private createRouterProxy(): RouterProxy {
    return new Proxy({}, {
      get: (_, routerName: string) => async (input: unknown) => {
        const event = { 
          type: 'router.route', 
          data: { routerName, input },
          ts: Date.now()
        };
        const result = await this.kernel.sendEvent(event);
        return result.data;
      }
    });
  }
  
  private createAgentProxy(): AgentProxy {
    return new Proxy({}, {
      get: (_, agentName: string) => async (input: unknown) => {
        const event = { 
          type: 'agent.delegate', 
          data: { targetAgent: agentName, input },
          ts: Date.now()
        };
        const result = await this.kernel.sendEvent(event);
        return result.data;
      }
    });
  }
}
```

**Critérios de Sucesso:**
- [ ] `ctx.tools.semgrep(code)` funciona
- [ ] `ctx.routers.smartRouter(decision)` funciona  
- [ ] `ctx.agents.expertAgent(input)` funciona
- [ ] 100% backward compatible
- [ ] Eventos fluem via Kernel

---

### **P1.3: Enhanced Action Types**

**Objetivo:** Adicionar novos action types para multi-agent coordination

**File:** `src/core/types/enhanced-action-types.ts`

```typescript
// Existing actions
export type BaseAgentAction<TContent = unknown> =
  | { type: 'tool_call'; toolName: string; input: unknown }
  | { type: 'final_answer'; content: TContent }
  | { type: 'need_more_info'; question: string };

// ✨ NEW: Enhanced actions para multi-agent
export type EnhancedAgentAction<TContent = unknown> = 
  | BaseAgentAction<TContent>
  | { type: 'delegate'; targetAgent: string; input: unknown; reason?: string }
  | { type: 'collaborate'; agents: string[]; strategy: 'parallel' | 'sequential'; input: unknown }
  | { type: 'route'; routerName: string; input: unknown; strategy?: string }
  | { type: 'plan'; plannerName: string; goal: string; context?: unknown }
  | { type: 'pause'; reason: string; resumeCondition?: unknown }
  | { type: 'broadcast'; event: string; data: unknown; recipients?: string[] };

export type AgentAction<TContent = unknown> = EnhancedAgentAction<TContent>;
```

**Integration Points:**
- Action registry handles new types
- Event handlers process new actions
- Kernel routes events correctly

---

### **P2.2: Agent Delegation**

**Objetivo:** Agents podem delegar tasks para outros agents via eventos

**File:** `src/engine/agent-delegation.ts`

```typescript
export class AgentDelegationHandler {
  constructor(
    private orchestration: OrchestrationImpl,
    private kernel: ExecutionKernel
  ) {}
  
  async handleDelegation(action: DelegateAction, context: AgentContext): Promise<Event> {
    const { targetAgent, input, reason } = action;
    
    // Find target agent
    const agent = this.orchestration.getAgent(targetAgent);
    if (!agent) {
      throw new EngineError('AGENT_ERROR', `Target agent '${targetAgent}' not found`);
    }
    
    // Create delegation context
    const delegationContext = {
      ...context,
      delegation: {
        fromAgent: context.agentName,
        reason: reason || 'Task delegation',
        timestamp: Date.now()
      }
    };
    
    // Execute target agent
    const delegationResult = await this.orchestration.callAgent(targetAgent, input);
    
    return {
      type: 'agent.delegation.completed',
      data: {
        fromAgent: context.agentName,
        targetAgent,
        result: delegationResult.data,
        success: delegationResult.status === 'completed'
      },
      ts: Date.now()
    };
  }
}
```

---

### **P3.1: Sequential Multi-Agent Pipelines**

**Objetivo:** Agents executam em sequence, output de um vira input do próximo

```typescript
// Usage Example
const securityPipeline = orchestration.createSequence(
  'securityAgent',    // Analisa code
  'qualityAgent',     // Verifica quality baseado no security report
  'deployAgent'       // Deploy se tudo estiver ok
);

const result = await securityPipeline.execute(prData);
// Flui: prData → securityAgent → qualityResult → deployAgent → finalResult
```

---

### **P3.2: Parallel Multi-Agent Execution**

**Objetivo:** Agents executam em paralelo, resultados são agregados

```typescript
// Usage Example
const analysisTeam = orchestration.createParallel(
  'securityAgent',     // Security analysis
  'performanceAgent',  // Performance analysis  
  'qualityAgent'       // Quality analysis
);

const results = await analysisTeam.execute(prData);
// Executa todos em paralelo: { security: ..., performance: ..., quality: ... }
```

---

## 📊 **PARALELIZATION STRATEGY**

### **Week 1: Enhanced Context (Critical Path)**
- **Dev2:** P1.1 ContextEnhancer (BLOCKS others)
- **Dev3:** P1.3 Action Types (PARALLEL)  
- **Dev1:** P0.4 ActionProcessor (DEPENDS on P1.3)
- **Dev4:** Setup integration tests

### **Week 2: Multi-Agent Communication**
- **Dev1:** P2.2 Agent Delegation
- **Dev2:** P1.2 Direct Tool Access  
- **Dev3:** P2.4 Router as Tool
- **Dev4:** P2.1 Agent Discovery

### **Week 3: Multi-Agent Coordination**
- **Dev1:** P3.1 Sequential Pipelines
- **Dev2:** P3.2 Parallel Execution
- **Dev3:** P3.3 Conditional Routing
- **Dev4:** P3.4 Global Ecosystem

### **Week 4: Polish & Production**
- **All devs:** Testing, debugging, performance optimization
- **Documentation:** Complete API docs
- **Examples:** Real-world usage examples

---

## 🎯 **SUCCESS CRITERIA**

### **Phase 1 Success:**
- [ ] `ctx.tools.toolName()` funciona perfeitamente
- [ ] Enhanced actions (`delegate`, `collaborate`) funcionam
- [ ] 100% backward compatibility mantida
- [ ] Performance não regrediu

### **Phase 2 Success:**
- [ ] Agent pode chamar outro agent: `ctx.agents.expertAgent(input)`
- [ ] Router funciona como tool: `ctx.tools.smartRouter(input)`
- [ ] Agent discovery funciona: `ctx.ecosystem.discover({ capability: 'analysis' })`
- [ ] Delegation events fluem corretamente via Kernel

### **Phase 3 Success:**
- [ ] Sequential pipelines funcionam: `pipeline.execute(input)`
- [ ] Parallel execution funciona: `team.execute(input)`
- [ ] Conditional routing funciona: `router.route(input, conditions)`
- [ ] Global ecosystem coordena agents automaticamente

### **Final Success:**
- [ ] **Demo case:** Complex multi-agent workflow working end-to-end
- [ ] **Performance:** No significant overhead vs single agent
- [ ] **Reliability:** Error recovery + circuit breakers working
- [ ] **Documentation:** Complete developer guide available

---

## 📚 **DOCUMENTATION REQUIREMENTS**

### **Developer Guides:**
1. **Multi-Agent Quick Start** - 5 min para primeiro multi-agent workflow
2. **Enhanced Context Guide** - `ctx.tools.toolName()` usage patterns
3. **Agent Coordination Patterns** - delegation, collaboration, routing
4. **Performance Best Practices** - optimizing multi-agent workflows
5. **Migration Guide** - single-agent → multi-agent migration

### **API References:**
1. **ContextEnhancer API** - enhanced context methods
2. **Action Types Reference** - all available action types
3. **Multi-Agent Patterns** - common coordination patterns
4. **Event Reference** - all multi-agent events

---

## 🚀 **NEXT STEPS**

### **🎯 IMMEDIATE (Next Task):**
**P3.1 - Router Híbrido Implementation**
- Refactor RouterHandler para aceitar `ruleFn` como primary decision
- Combinar regras declarativas simples + load balancing inteligente
- Manter debug logs claros e legíveis
- Backward compatibility com RouterHandler existente

### **📋 THIS WEEK:**
1. **P3.1** - Router Híbrido (regras declarativas + load balancing)
2. **P3.2** - Planner Handler (`ctx.plan()` + CoT/ToT/Graph strategies)
3. **P3.3** - Circuit Breakers (fault tolerance para multi-agent)
4. Integration testing para end-to-end multi-agent workflows

### **🔮 NEXT SPRINT:**
1. **P3.4-P3.5** - Sequential/Parallel Multi-Agent Pipelines
2. **P3.6** - Real Kernel Integration (EventKernel vs mock)
3. Performance benchmarking multi-agent vs single-agent
4. Real-world usage examples e documentation

### **✅ COMPLETED THIS SPRINT:**
- **Phase 1 & 2 Complete!** 🎉
- Enhanced Context (`ctx.tools.toolName()`, `ctx.agents.agentName()`)
- 8 Enhanced Action Types (delegate, collaborate, route, plan, etc.)
- Real Agent Execution (RealAgentExecutor vs mocks)
- State Synchronization (merge strategies)
- Event Subscription (pattern matching)
- Agent Discovery & Registry (EcosystemHandler)
- RouterHandler v1 (multiple strategies)

---

**Este roadmap garante que qualquer dev sabe exatamente o que fazer, quando fazer, e como contribuir para o multi-agent system! 🎯**