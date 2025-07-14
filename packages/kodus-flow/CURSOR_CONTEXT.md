# 🎯 CURSOR CONTEXT - KODUS FLOW ARCHITECTURE

## 📋 **VISÃO GERAL**

O **Kodus Flow** é um framework enterprise para orquestração de agentes de IA com arquitetura em **5 camadas bem definidas**. Cada camada tem responsabilidades específicas e **NÃO deve interferir nas outras**.

---

## 🎯 **CAMADA 1: ORCHESTRATION LAYER**

### **📁 Localização**
```
src/orchestration/
├── sdk-orchestrator.ts    # API principal
├── types.ts               # Tipos da orquestração
└── index.ts               # Exports
```

### **🎯 Responsabilidade ÚNICA**
**Expor APIs simples para o usuário final** - é a **porta de entrada** do framework.

### **✅ O QUE PODE FAZER**
```typescript
// ✅ Criar agentes
orchestration.createAgent({
  name: 'my-agent',
  think: async (input) => ({ reasoning: '...', action: { type: 'final_answer', content: input } })
});

// ✅ Chamar agentes
const result = await orchestration.callAgent('my-agent', 'Hello!');

// ✅ Criar tools
orchestration.createTool({
  name: 'calculator',
  execute: async (input) => ({ result: eval(input.expression) })
});

// ✅ Integração MCP
await orchestration.connectMCP();
```

### **❌ O QUE NÃO PODE FAZER**
- ❌ Processar eventos diretamente
- ❌ Gerenciar contexto ou estado
- ❌ Aplicar middleware
- ❌ Criar snapshots
- ❌ Enforçar quotas

### **🔄 Comunicação Permitida**
```typescript
// ✅ PODE: Usar AgentEngine/AgentExecutor
const agentInstance = new AgentEngine(definition, toolEngine, config);

// ✅ PODE: Usar observabilidade
this.logger = createLogger('sdk-orchestrator');

// ❌ NÃO PODE: Acessar Runtime diretamente
// ❌ NÃO PODE: Acessar Kernel diretamente
```

---

## 🧠 **CAMADA 2: ENGINE LAYER**

### **📁 Localização**
```
src/engine/
├── agents/
│   ├── agent-engine.ts      # Execução direta
│   ├── agent-executor.ts    # Execução via workflow
│   └── agent-core.ts        # Lógica compartilhada
├── tools/
│   └── tool-engine.ts       # Gerenciamento de tools
├── workflows/
│   └── workflow-engine.ts   # Coordenação de workflows
└── routing/
    └── router.ts            # Roteamento inteligente
```

### **🎯 Responsabilidade ÚNICA**
**Executar agentes, tools e workflows** - é o **cérebro** do framework.

### **✅ O QUE PODE FAZER**

#### **AgentEngine (Execução Direta)**
```typescript
// ✅ Execução direta sem workflow
const agent = new AgentEngine(definition, toolEngine, config);
const result = await agent.execute(input, options);

// ✅ Lifecycle simples
await agent.start({ agentName: 'my-agent', tenantId: 'tenant-1' });
await agent.stop({ agentName: 'my-agent', tenantId: 'tenant-1' });
```

#### **AgentExecutor (Execução via Workflow)**
```typescript
// ✅ Execução via workflow com lifecycle completo
const executor = new AgentExecutor(definition, toolEngine, config);
const result = await executor.executeViaWorkflow(input, options);

// ✅ Lifecycle completo
await executor.pause({ agentName: 'my-agent', reason: 'maintenance' });
await executor.resume({ agentName: 'my-agent', snapshotId: 'snapshot-123' });
```

### **❌ O QUE NÃO PODE FAZER**
- ❌ Gerenciar contexto ou estado (usa Kernel)
- ❌ Processar eventos (usa Runtime)
- ❌ Aplicar middleware (usa Runtime)
- ❌ Criar snapshots (usa Kernel)

### **🔄 Comunicação Permitida**
```typescript
// ✅ PODE: Usar Kernel para contexto
if (this.config.enableKernelIntegration) {
  this.kernelHandler = new KernelHandler();
}

// ✅ PODE: Usar Runtime (apenas AgentExecutor)
if (agentInstance instanceof AgentExecutor) {
  await this.runtime.emit('agent.execution.started', { agentName: 'my-agent' });
}

// ✅ PODE: Usar observabilidade
this.logger = createLogger('agent-engine');

// ❌ NÃO PODE: Acessar Runtime diretamente (AgentEngine)
// ❌ NÃO PODE: Gerenciar contexto diretamente
```

---

## 🧠 **CAMADA 3: KERNEL LAYER**

### **📁 Localização**
```
src/kernel/
├── kernel.ts               # ExecutionKernel principal
├── snapshot.ts             # Gerenciamento de snapshots
├── persistor.ts            # Persistência
└── index.ts                # Exports
```

### **🎯 Responsabilidade ÚNICA**
**Gerenciar contexto, estado e isolamento** - é o **sistema nervoso** do framework.

### **✅ O QUE PODE FAZER**
```typescript
// ✅ Gerenciamento de contexto
kernel.setContext('user', 'preferences', { language: 'typescript' });
const prefs = kernel.getContext('user', 'preferences');

// ✅ Snapshots e persistência
const snapshotId = await kernel.pause(reason);
await kernel.resume(snapshotId);

// ✅ Quota management
kernel.setQuota('maxEvents', 1000);
kernel.setQuota('maxDuration', 60000);

// ✅ Operações atômicas
await kernel.executeAtomicOperation('op-123', async () => {
  // Operação atômica
}, { timeout: 30000, retries: 3 });
```

### **❌ O QUE NÃO PODE FAZER**
- ❌ Processar eventos diretamente (delega para Runtime)
- ❌ Gerenciar streams (delega para Runtime)
- ❌ Aplicar middleware (delega para Runtime)
- ❌ Otimizar performance (delega para Runtime)

### **🔄 Comunicação Permitida**
```typescript
// ✅ PODE: Usar Runtime para processamento
this.runtime = createRuntime(workflowContext, observability, runtimeConfig);
await this.runtime.emitAsync(eventType, eventData);

// ✅ PODE: Usar observabilidade
this.logger = createLogger('kernel');

// ❌ NÃO PODE: Processar eventos diretamente
// ❌ NÃO PODE: Gerenciar streams diretamente
```

---

## ⚡ **CAMADA 4: RUNTIME LAYER**

### **📁 Localização**
```
src/runtime/
├── core/
│   ├── event-queue.ts           # Fila de eventos
│   ├── event-processor-optimized.ts # Processamento otimizado
│   └── stream-manager.ts        # Operadores de stream
├── middleware/
│   ├── retry.ts                 # Retry automático
│   ├── timeout.ts               # Controle de tempo
│   ├── concurrency.ts           # Controle de concorrência
│   └── validate.ts              # Validação de eventos
└── index.ts                     # API principal
```

### **🎯 Responsabilidade ÚNICA**
**Processar eventos e streams** - é o **sistema circulatório** do framework.

### **✅ O QUE PODE FAZER**
```typescript
// ✅ Event bus
runtime.on('user.created', async (event) => {
  console.log('User created:', event.data);
});

runtime.emit('user.created', { userId: '123', name: 'John' });

// ✅ Stream processing
const userStream = runtime.createStream(async function* () {
  for (let i = 0; i < 100; i++) {
    yield runtime.createEvent('user.created', { userId: `user-${i}` });
  }
});

// ✅ Middleware application
const runtime = createRuntime(context, observability, {
  middleware: [
    withRetry({ maxRetries: 3 }),
    withTimeout({ timeoutMs: 5000 }),
    withConcurrency({ maxConcurrent: 10 })
  ]
});
```

### **❌ O QUE NÃO PODE FAZER**
- ❌ Gerenciar contexto ou estado (delega para Kernel)
- ❌ Criar snapshots (delega para Kernel)
- ❌ Enforçar quotas (delega para Kernel)
- ❌ Gerenciar security (delega para Kernel)

### **🔄 Comunicação Permitida**
```typescript
// ✅ PODE: Usar observabilidade
this.logger = createLogger('runtime');

// ✅ PODE: Receber eventos do Kernel
await runtime.processEvents();

// ❌ NÃO PODE: Gerenciar contexto diretamente
// ❌ NÃO PODE: Criar snapshots diretamente
```

---

## 📊 **CAMADA 5: OBSERVABILITY LAYER**

### **📁 Localização**
```
src/observability/
├── logger.ts               # Logging estruturado
├── telemetry.ts            # OpenTelemetry
├── monitoring.ts           # Métricas por camada
├── debugging.ts            # Debugging tools
└── index.ts                # Sistema unificado
```

### **🎯 Responsabilidade ÚNICA**
**Fornecer observabilidade para todas as camadas** - é o **sistema sensorial** do framework.

### **✅ O QUE PODE FAZER**
```typescript
// ✅ Logging estruturado
const logger = createLogger('my-component');
logger.info('Operation started', { correlationId: 'corr-123' });

// ✅ Telemetry com spans
const telemetry = getTelemetry();
await telemetry.trace('user.creation', async () => {
  // Operação rastreada
});

// ✅ Monitoring com métricas específicas
const monitoring = getLayeredMetricsSystem();
monitoring.recordKernelMetric('contextOperations', 'get', 1);
monitoring.recordRuntimeMetric('eventProcessing', 'totalEvents', 100);

// ✅ Debugging com stack traces
const debug = getGlobalDebugSystem();
const debugReport = debug.generateReport();
```

### **❌ O QUE NÃO PODE FAZER**
- ❌ Processar eventos (delega para Runtime)
- ❌ Gerenciar contexto (delega para Kernel)
- ❌ Executar agentes (delega para Engine)
- ❌ Criar workflows (delega para Orchestration)

### **🔄 Comunicação Permitida**
```typescript
// ✅ PODE: Ser usado por todas as camadas
// Cada camada usa observabilidade para logging, telemetry, monitoring

// ❌ NÃO PODE: Executar lógica de negócio
// ❌ NÃO PODE: Processar eventos
```

---

## 🚫 **REGRAS CRÍTICAS PARA LLMs**

### **1. NUNCA Acesse Camadas Diretamente**
```typescript
// ❌ ERRADO: Acessar Runtime da Engine
this.runtime = createRuntime(); // NÃO FAÇA ISSO

// ❌ ERRADO: Acessar Kernel da Runtime
this.kernel = createKernel(); // NÃO FAÇA ISSO

// ✅ CORRETO: Usar comunicação permitida
if (this.config.enableKernelIntegration) {
  this.kernelHandler = new KernelHandler(); // ✅
}
```

### **2. NUNCA Duplique Funcionalidades**
```typescript
// ❌ ERRADO: Criar novo sistema de eventos na Engine
class MyEventSystem {} // NÃO FAÇA ISSO

// ❌ ERRADO: Criar novo sistema de contexto na Runtime
class MyContextManager {} // NÃO FAÇA ISSO

// ✅ CORRETO: Usar sistemas existentes
this.logger = createLogger('my-component'); // ✅
```

### **3. NUNCA Mude Responsabilidades**
```typescript
// ❌ ERRADO: Engine processando eventos diretamente
async processEvents() {} // NÃO FAÇA ISSO

// ❌ ERRADO: Runtime gerenciando contexto
setContext() {} // NÃO FAÇA ISSO

// ✅ CORRETO: Manter responsabilidades
async execute(input) {} // ✅ Engine executa agentes
```

### **4. SEMPRE Use Comunicação Permitida**
```typescript
// ✅ CORRETO: Engine → Kernel (para contexto)
if (this.config.enableKernelIntegration) {
  const context = this.kernelHandler.getContext('agent', 'state');
}

// ✅ CORRETO: Engine → Runtime (apenas AgentExecutor)
if (agentInstance instanceof AgentExecutor) {
  await this.runtime.emit('agent.execution.started', { agentName: 'my-agent' });
}

// ✅ CORRETO: Todas as camadas → Observability
this.logger = createLogger('my-component');
```

---

## 📋 **RESUMO DAS RESPONSABILIDADES**

| Camada | Responsabilidade | Pode Usar | NÃO Pode Usar |
|--------|------------------|------------|---------------|
| **Orchestration** | API simples | Engine, Observability | Runtime, Kernel |
| **Engine** | Executar agentes | Kernel, Runtime*, Observability | - |
| **Kernel** | Contexto e estado | Runtime, Observability | - |
| **Runtime** | Processar eventos | Observability | Kernel, Engine |
| **Observability** | Logging, telemetry | - | Todas as outras |

*Runtime apenas para AgentExecutor, não para AgentEngine

---

## 🎯 **FLUXO CORRETO DE DESENVOLVIMENTO**

### **1. Identifique a Camada**
```typescript
// Se você está criando uma API para usuário → ORCHESTRATION
// Se você está executando agentes → ENGINE
// Se você está gerenciando contexto → KERNEL
// Se você está processando eventos → RUNTIME
// Se você está observando → OBSERVABILITY
```

### **2. Use Comunicação Permitida**
```typescript
// ✅ SEMPRE use a comunicação permitida
// ✅ NUNCA acesse camadas diretamente
// ✅ SEMPRE use observabilidade
```

### **3. Mantenha Responsabilidades**
```typescript
// ✅ SEMPRE mantenha a responsabilidade da camada
// ✅ NUNCA duplique funcionalidades
// ✅ SEMPRE use sistemas existentes
```

---

## 🚀 **EXEMPLOS PRÁTICOS**

### **Criando um Novo Agente**
```typescript
// ✅ CORRETO: Usar Orchestration Layer
orchestration.createAgent({
  name: 'my-new-agent',
  think: async (input) => ({ reasoning: '...', action: { type: 'final_answer', content: input } })
});

// ❌ ERRADO: Acessar Engine diretamente
const agent = new AgentEngine(); // NÃO FAÇA ISSO
```

### **Adicionando Logging**
```typescript
// ✅ CORRETO: Usar Observability
this.logger = createLogger('my-component');
this.logger.info('Operation started', { correlationId: 'corr-123' });

// ❌ ERRADO: Criar logger próprio
console.log('Operation started'); // NÃO FAÇA ISSO
```

### **Gerenciando Contexto**
```typescript
// ✅ CORRETO: Usar Kernel (se enableKernelIntegration=true)
if (this.config.enableKernelIntegration) {
  this.kernelHandler.setContext('agent', 'state', { status: 'running' });
}

// ❌ ERRADO: Gerenciar contexto diretamente
this.context = {}; // NÃO FAÇA ISSO
```

Esta arquitetura garante **separação clara**, **comunicação bem definida** e **escalabilidade enterprise**. **RESPEITE AS REGRAS** para manter a integridade do framework. 
