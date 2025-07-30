# Nova Estrutura de Agentes - Kodus Flow

Esta pasta contém a nova implementação de agentes do Kodus Flow, com suporte completo a todos os tipos de agentes e funcionalidades.

## 🏗️ Arquitetura Corrigida

### Core Compartilhado (`agent-core.ts`)
- **Responsabilidades**: Apenas lógica básica compartilhada
- **Funcionalidades**:
  - ✅ State, Context, Logging
  - ✅ Communication, Router, Coordination
  - ✅ Thinking, Actions, Tools
  - ✅ Event tracking, Observability
  - ✅ Multi-agent support
- **NÃO inclui**:
  - ❌ Lifecycle management (usa AgentLifecycleHandler existente)
  - ❌ Workflow execution (responsabilidade do executor)
  - ❌ Snapshot management (responsabilidade do executor)

### AgentEngine (`agent-engine.ts`)
- **Propósito**: Execução direta de agentes (sem workflow)
- **Características**:
  - ✅ Execução direta e rápida
  - ✅ Sem overhead de workflow
  - ✅ Sem pause/resume
  - ✅ Ideal para agentes simples e autônomos
  - ✅ Suporte completo a tools e multi-agent

### AgentExecutor (`agent-executor.ts`)
- **Propósito**: Execução via workflow com lifecycle completo
- **Características**:
  - ✅ Execução via workflow com pause/resume
  - ✅ Lifecycle completo (usa AgentLifecycleHandler existente)
  - ✅ Snapshots e persistência
  - ✅ Middleware e observabilidade avançada
  - ✅ Ideal para agentes complexos e long-running

## 🚀 Uso Rápido

### Single Agent - Execução Direta

```typescript
import { createAgent } from './agent-engine.js';

// Definir agente
const myAgent: AgentDefinition<string, string, string> = {
    name: 'my-agent',
    description: 'Meu agente personalizado',
    think: async (input: string, context: AgentContext) => {
        return {
            reasoning: 'Processando input',
            action: {
                type: 'final_answer',
                content: `Processado: ${input}`,
            },
        };
    },
};

// Criar agent
const agent = createAgent(myAgent, { tenantId: 'tenant-1' });

// Executar
const result = await agent.execute('Olá, mundo!');
console.log(result.output); // "Processado: Olá, mundo!"
```

### Single Agent - Execução via Workflow

```typescript
import { createWorkflowAgent } from './agent-executor.js';

// Criar workflow agent com lifecycle completo
const workflowAgent = createWorkflowAgent(myAgent, { 
    tenantId: 'tenant-1',
    enableMultiAgent: true,
    enableTools: true,
});

// Start lifecycle (usa AgentLifecycleHandler existente)
await workflowAgent.start({
    agentName: 'my-agent',
    tenantId: 'tenant-1',
});

// Executar via workflow
const result = await workflowAgent.executeViaWorkflow('Olá, mundo!');

// Pause/Resume
const snapshotId = await workflowAgent.pauseExecution('Pausa programada');
await workflowAgent.resumeExecution(snapshotId);

// Stop lifecycle (usa AgentLifecycleHandler existente)
await workflowAgent.stop({
    agentName: 'my-agent',
    tenantId: 'tenant-1',
});
```

### Multi-Agent com Coordenação

```typescript
import { createWorkflowAgent } from './agent-executor.js';

// Criar coordenador
const coordinator = createWorkflowAgent(coordinatorAgent, {
    tenantId: 'tenant-1',
    enableMultiAgent: true,
    enableDelegation: true,
});

// Registrar agentes
coordinator.registerAgent(textAnalyzerAgent);
coordinator.registerAgent(mathAgent);

// Executar (será delegado automaticamente)
const result = await coordinator.executeViaWorkflow('Calcular: 2 + 3 * 4');
```

## 📊 Comparação de Abordagens

| Característica | Agent (Direto) | WorkflowAgent (Workflow) |
|----------------|----------------|-------------------------|
| **Performance** | ⚡ Rápido | 🐌 Mais lento (overhead) |
| **Pause/Resume** | ❌ Não | ✅ Sim |
| **Snapshots** | ❌ Não | ✅ Sim |
| **Lifecycle** | ❌ Básico | ✅ Completo |
| **Observabilidade** | ✅ Básica | ✅ Avançada |
| **Middleware** | ❌ Não | ✅ Sim |
| **Complexidade** | 🟢 Simples | 🟡 Média |
| **Casos de Uso** | Agentes simples | Agentes complexos |

## 🔧 Configuração

### AgentCoreConfig

```typescript
interface AgentCoreConfig {
    // Identity & Multi-tenancy
    tenantId: string;
    agentName?: string;

    // Debugging & Monitoring
    debug?: boolean;
    monitoring?: boolean;

    // Performance & Concurrency
    maxConcurrentAgents?: number;
    agentTimeout?: number;
    maxThinkingIterations?: number;
    thinkingTimeout?: number;

    // Execution Control
    timeout?: number;
    enableFallback?: boolean;
    concurrency?: number;

    // Multi-Agent Support
    enableMultiAgent?: boolean;
    maxChainDepth?: number;
    enableDelegation?: boolean;

    // Tool Integration
    enableTools?: boolean;
    toolTimeout?: number;
    maxToolRetries?: number;
}
```

## 🎯 Tipos de Agentes Suportados

### 1. Single Agent
- **Descrição**: Agente único com execução direta
- **Uso**: `createAgent()` com configurações básicas
- **Ideal para**: Tarefas simples, processamento rápido

### 2. Multi-Agent
- **Descrição**: Múltiplos agentes com coordenação
- **Uso**: `createWorkflowAgent()` + `registerAgent()`
- **Ideal para**: Tarefas complexas, especialização

### 3. Workflow Agent
- **Descrição**: Agente com controle completo de lifecycle
- **Uso**: `createWorkflowAgent()` com configurações avançadas
- **Ideal para**: Agentes long-running, com pause/resume

### 4. Tool-Enabled Agent
- **Descrição**: Agente que usa ferramentas externas
- **Uso**: Configurar `enableTools: true` + ToolEngine
- **Ideal para**: Integração com APIs, processamento externo

## 🔄 Lifecycle Management

### Estados do Agente
- `stopped` → `starting` → `running`
- `running` → `pausing` → `paused`
- `paused` → `resuming` → `running`
- `running` → `stopping` → `stopped`
- `*` → `scheduled` → `running`

### Operações de Lifecycle
```typescript
// Start (usa AgentLifecycleHandler existente)
await agent.start({ agentName: 'my-agent', tenantId: 'tenant-1' });

// Stop
await agent.stop({ agentName: 'my-agent', tenantId: 'tenant-1' });

// Pause (apenas WorkflowAgent)
await agent.pause({ agentName: 'my-agent', tenantId: 'tenant-1', reason: 'Pausa' });

// Resume (apenas WorkflowAgent)
await agent.resume({ agentName: 'my-agent', tenantId: 'tenant-1', snapshotId: 'snapshot-123' });

// Schedule
await agent.schedule({ agentName: 'my-agent', tenantId: 'tenant-1', scheduleTime: Date.now() + 60000 });
```

## 🏭 Factory Functions

### Agent (Execução Direta)
```typescript
// Criar agent simples
const agent = createAgent(definition, { tenantId: 'tenant-1' });

// Criar agent com configurações avançadas
const agent = createAgent(definition, {
    tenantId: 'tenant-1',
    enableMultiAgent: true,
    enableTools: true,
    maxThinkingIterations: 10,
});
```

### WorkflowAgent (Execução via Workflow)
```typescript
// Criar workflow agent
const workflowAgent = createWorkflowAgent(definition, { tenantId: 'tenant-1' });

// Criar workflow agent com configurações avançadas
const workflowAgent = createWorkflowAgent(definition, {
    tenantId: 'tenant-1',
    enableMultiAgent: true,
    enableTools: true,
    maxChainDepth: 5,
});
```

## 📊 Status & Monitoring

### Agent Status
```typescript
// Status do agent
const status = agent.getStatus();
console.log(status);
// {
//   initialized: true,
//   mode: 'single',
//   agentCount: 1,
//   agents: ['my-agent'],
//   eventCount: 5,
//   activeExecutions: 1
// }

// Engine status (AgentEngine)
const engineStatus = agent.getEngineStatus();
console.log(engineStatus);
// {
//   engineType: 'direct',
//   agentName: 'my-agent',
//   isReady: true,
//   lifecycleStatus: 'running',
//   activeExecutions: 1,
//   totalExecutions: 5
// }

// Executor status (AgentExecutor)
const executorStatus = workflowAgent.getExecutorStatus();
console.log(executorStatus);
// {
//   executorType: 'workflow',
//   agentName: 'my-agent',
//   isReady: true,
//   lifecycleStatus: 'running',
//   workflowStatus: 'running',
//   activeExecutions: 1,
//   totalExecutions: 5,
//   isPaused: false
// }
```

### Execution Statistics
```typescript
// Estatísticas de execução
const stats = agent.getExecutionStats();
console.log(stats);
// {
//   totalExecutions: 10,
//   successfulExecutions: 9,
//   failedExecutions: 1,
//   averageExecutionTime: 150,
//   lastExecutionTime: 120
// }
```

## 🎯 Casos de Uso

### Agente Simples (Execução Direta)
```typescript
const simpleAgent = createAgent({
    name: 'simple-agent',
    think: async (input) => ({ reasoning: 'Processado', action: { type: 'final_answer', content: input } })
}, { tenantId: 'tenant-1' });

const result = await simpleAgent.execute('teste');
```

### Agente Complexo (Workflow)
```typescript
const complexAgent = createWorkflowAgent({
    name: 'complex-agent',
    think: async (input) => ({ reasoning: 'Processando...', action: { type: 'final_answer', content: input } })
}, {
    tenantId: 'tenant-1',
    enableMultiAgent: true,
    enableTools: true,
    maxThinkingIterations: 10
});

await complexAgent.start({ agentName: 'complex-agent', tenantId: 'tenant-1' });
const result = await complexAgent.executeViaWorkflow('teste');
await complexAgent.stop({ agentName: 'complex-agent', tenantId: 'tenant-1' });
```

### Multi-Agent com Delegação
```typescript
const coordinator = createWorkflowAgent(coordinatorAgent, {
    tenantId: 'tenant-1',
    enableMultiAgent: true,
    enableDelegation: true,
    maxChainDepth: 3
});

coordinator.registerAgent(textAnalyzerAgent);
coordinator.registerAgent(mathAgent);

const result = await coordinator.executeViaWorkflow('Calcular: 2 + 3 * 4');
```

## 🔧 Configurações Avançadas

### Performance
```typescript
const config: AgentCoreConfig = {
    tenantId: 'tenant-1',
    maxConcurrentAgents: 5,
    agentTimeout: 30000,
    maxThinkingIterations: 5,
    thinkingTimeout: 10000,
    timeout: 60000,
};
```

### Multi-Agent
```typescript
const config: AgentCoreConfig = {
    tenantId: 'tenant-1',
    enableMultiAgent: true,
    maxChainDepth: 5,
    enableDelegation: true,
};
```

### Tools
```typescript
const config: AgentCoreConfig = {
    tenantId: 'tenant-1',
    enableTools: true,
    toolTimeout: 30000,
    maxToolRetries: 3,
};
```

### Debugging
```typescript
const config: AgentCoreConfig = {
    tenantId: 'tenant-1',
    debug: true,
    monitoring: true,
};
```

## 🚀 Próximos Passos

1. **Testes**: Implementar testes unitários e de integração
2. **Documentação**: Expandir documentação com exemplos práticos
3. **Performance**: Otimizar performance para casos de uso específicos
4. **Integração**: Integrar com outros componentes do Kodus Flow
5. **Observabilidade**: Adicionar métricas e alertas avançados 