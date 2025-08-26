# 🎯 Clean Architecture Refactor Plan

## **📋 O que mudou - AgentContext Interface:**

### **❌ ANTES (Problemático):**
```typescript
interface AgentContext {
  memory: { store, search, query };     // ❌ Infrastructure concern
  session: { addMessage, getHistory };  // ✅ Keep but rename
  telemetry: { trackTool, trackError }; // ❌ Cross-cutting concern
  state: { get, set, clear };          // ❌ Generic, unstructured
}
```

### **✅ DEPOIS (Clean):**
```typescript
interface AgentContext {
  // Agent Identity & Session
  sessionId: string;
  agentName: string;
  correlationId: string;
  
  // Core agent concern
  conversation: { addMessage, getHistory, updateMetadata };
  
  // Structured working memory
  variables: { set, get, has, delete, clear, keys };
  
  // Tools for this execution
  availableTools: ToolMetadataForPlanner[];
  
  // Execution control
  signal: AbortSignal;
  cleanup: () => Promise<void>;
}
```

---

## **🔧 O que precisa ser ajustado:**

### **1. AgentCore (agent-core.ts)**

#### **Memory calls → Dependency Injection:**
```typescript
// ❌ ANTES:
context.memory.store(content);
context.memory.search(query);

// ✅ DEPOIS: 
class AgentCore {
  constructor(
    private memoryManager: MemoryManager,
    private observability: ObservabilitySystem
  ) {}
  
  async execute(context: AgentContext) {
    await this.memoryManager.store(content);
    await this.memoryManager.search(query);
  }
}
```

#### **Telemetry calls → Direct observability:**
```typescript
// ❌ ANTES:
context.telemetry.trackTool(name, params, result, success);
context.telemetry.trackError(error);

// ✅ DEPOIS:
const observability = getObservability();
observability.telemetry.trackTool(name, success);
observability.logError(error);
```

#### **State calls → Variables:**
```typescript
// ❌ ANTES:
context.state.set('namespace', 'key', value);
context.state.get('namespace', 'key');

// ✅ DEPOIS:
context.variables.set('key', value);
context.variables.get<T>('key');
```

#### **Session calls → Conversation:**
```typescript
// ❌ ANTES:
context.session.addMessage(role, content);
context.session.getHistory();

// ✅ DEPOIS:
context.conversation.addMessage(role, content);
context.conversation.getHistory();
```

### **2. Planners (plan-execute-planner.ts)**

#### **Remove runtime dump calls:**
```typescript
// ❌ REMOVE COMPLETELY:
context.session.addEntry({ type: 'plan_created' }, { planId });
context.session.addEntry({ type: 'execution_start' }, { details });

// ✅ USE TELEMETRY INSTEAD:
const observability = getObservability();
observability.telemetry.trackPlanner({ type: 'plan_created', planId });
```

### **3. Enhanced Context Builder (enhanced-context-builder.ts)**

#### **Update to new interface:**
```typescript
// ❌ ANTES:
agentContext.session.addEntry(input, output);

// ✅ DEPOIS:
agentContext.conversation.addMessage('system', content, metadata);
```

### **4. Step Execution (step-execution.ts)**

#### **Convert to clean calls:**
```typescript
// ❌ ANTES:
context.session.addEntry({ type: 'message' }, { metadata });

// ✅ DEPOIS:
context.conversation.addMessage(role, content, metadata);
```

---

## **📁 Arquivos que precisam mudança:**

### **Alta Prioridade:**
1. ✅ `agent-types.ts` - Interface atualizada
2. ✅ `context-builder.ts` - Implementation atualizada  
3. 🔄 `agent-core.ts` - Convert all calls (9+ locations)
4. 🔄 `plan-execute-planner.ts` - Convert all calls (5+ locations)

### **Média Prioridade:**
5. ✅ `enhanced-context-builder.ts` - Migrado
6. ✅ `step-execution.ts` - Comentado temporariamente
7. ✅ `plan-executor.ts` - Comentado temporariamente

---

## **🚀 Dependency Injection Pattern:**

### **AgentCore Constructor:**
```typescript
export class AgentCore<TInput, TOutput, TContent> {
  constructor(
    config: AgentCoreConfig,
    private memoryManager: MemoryManager,
    private observability: ObservabilitySystem,
    private sessionService: SessionService
  ) {
    // Core logic only
  }
  
  async execute(input: TInput, context: AgentContext) {
    // Use injected dependencies
    await this.memoryManager.store(result);
    this.observability.telemetry.trackTool(toolName, success);
  }
}
```

### **Factory Pattern:**
```typescript
export function createAgentCore<TInput, TOutput, TContent>(
  config: AgentCoreConfig
): AgentCore<TInput, TOutput, TContent> {
  return new AgentCore(
    config,
    getGlobalMemoryManager(),
    getObservability(),
    new SessionService()
  );
}
```

---

## **📊 Benefícios da Refactor:**

### **✅ Clean Architecture:**
- **Single Responsibility** - AgentContext apenas para contexto de agente
- **Dependency Inversion** - Services injetados, não acoplados
- **Interface Segregation** - Interfaces menores e focadas

### **✅ Maintainability:**
- **Easier Testing** - Mock dependencies facilmente
- **Better Separation** - Concerns separados claramente  
- **Type Safety** - Interfaces mais específicas

### **✅ Performance:**
- **Less Memory** - Contexto mais leve
- **Better Caching** - Services singleton/global
- **Cleaner Database** - Conversation sem runtime dump

---

## **🎯 Next Steps:**

1. **Fix AgentCore** - Convert all calls
2. **Fix Planners** - Remove runtime dumps  
3. **Update Callers** - Migrate all usages
4. **Test & Validate** - Ensure everything works
5. **Document** - Update examples and docs