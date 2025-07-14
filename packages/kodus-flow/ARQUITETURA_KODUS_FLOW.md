# Arquitetura do Kodus Flow - Extensões para Framework Enterprise

Esta documentação define as **3 extensões** planejadas para o framework enterprise robusto já existente no Kodus Flow.

## Contexto da Arquitetura Existente

O Kodus Flow já possui uma **infraestrutura enterprise completa**:

### 🏗️ **Arquitetura em 5 Camadas**
```
USER APP → Orchestration → Engine → Kernel → Runtime
```

### 🛡️ **Sistemas Robustos Existentes**
- ✅ **Multi-tenancy** com security, rate limiting, tenant validation
- ✅ **Observability** com telemetria OpenTelemetry, monitoring, debugging
- ✅ **Error handling** tipado com hierarchy de erros e recovery
- ✅ **Snapshot/Resume** com persistência e estado
- ✅ **Circuit breakers** e middleware resiliente
- ✅ **Stream processing** e context management
- ✅ **Agent/Tool/Workflow engines** básicos
- ✅ **Type system** rigoroso com branded types

## 3 Extensões Planejadas

### 1. **Gateway** - Roteamento Inteligente (NOVO)
### 2. **Enhanced Workflows** - Conditional, Parallel, Loops (EXTENSÃO)
### 3. **Multi-Agent** - Coordenação de Múltiplos Agentes (EXTENSÃO)

---

## 🚪 **EXTENSÃO 1: Gateway - Roteamento Inteligente**

### **Integração na Arquitetura**
```
USER APP → Gateway → Orchestration → Engine → Kernel → Runtime
```

### **Objetivo**
Camada de roteamento inteligente que analisa entrada do usuário e decide automaticamente qual Agent/Workflow executar.

### **Types Criados** (`/src/core/types/common-types.ts`)

```typescript
// Estratégias de roteamento
export type RoutingStrategy = 
    | 'llm_based'      // LLM analisa entrada e decide
    | 'rule_based'     // Regras predefinidas
    | 'hybrid'         // Combina LLM + regras
    | 'round_robin'    // Round-robin simples
    | 'random';        // Aleatório

// Decisão de roteamento
export interface RoutingDecision {
    target: string;
    targetType: 'agent' | 'workflow' | 'gateway';
    confidence: number; // 0-1
    reasoning?: string;
    metadata?: Record<string, unknown>;
}

// Configuração do Gateway
export interface GatewayConfig {
    name: string;
    strategy: RoutingStrategy;
    
    // Alvos disponíveis
    agents: string[];
    workflows: string[];
    gateways: string[];
    
    // Configuração LLM
    llmConfig?: {
        prompt?: string;
        model?: string;
        temperature?: number;
        cacheDecisions?: boolean;
    };
    
    // Regras de roteamento
    rules: Array<{
        condition: string;
        target: string;
        targetType: 'agent' | 'workflow' | 'gateway';
        priority: number;
    }>;
    
    // Fallback
    fallback?: {
        target?: string;
        strategy: 'default_target' | 'error' | 'human_handoff';
    };
}
```

### **Error Codes Adicionados** (`/src/core/errors.ts`)

```typescript
export type GatewayErrorCode =
    | 'ROUTING_FAILED'
    | 'TARGET_NOT_FOUND'
    | 'ROUTING_TIMEOUT'
    | 'LLM_ROUTING_ERROR'
    | 'RULE_EVALUATION_ERROR'
    | 'FALLBACK_FAILED'
    | 'GATEWAY_INIT_ERROR'
    | 'INVALID_ROUTING_CONFIG'
    | 'ROUTING_CACHE_ERROR'
    | 'TARGET_EXECUTION_FAILED';
```

### **Integração com Observability**
- **Logger**: `createLogger('gateway:routing')`
- **Telemetry**: Spans para decisões de roteamento
- **Monitoring**: Métricas de performance de roteamento
- **Context**: Correlation IDs para rastreamento

### **Exemplo de Uso**

```typescript
import { createKodusFlow } from '@kodus/flow';

const kodus = await createKodusFlow({
    tenant: { tenantId: 'my-saas-client-123' },
    gateway: {
        name: 'SupportGateway',
        strategy: 'hybrid',
        agents: ['CodeAnalyzer', 'DatabaseExpert', 'SecurityExpert'],
        workflows: ['BugFixWorkflow', 'SecurityAuditWorkflow'],
        llmConfig: {
            prompt: `Analise a consulta e direcione para:
            - CodeAnalyzer: bugs, código, refatoração
            - DatabaseExpert: SQL, performance de banco
            - SecurityExpert: vulnerabilidades, auth`,
            temperature: 0.1,
            cacheDecisions: true
        },
        fallback: {
            strategy: 'default_target',
            target: 'CodeAnalyzer'
        }
    }
});

// Roteamento automático
const result = await kodus.gateway('SupportGateway', 
    'Meu banco de dados está muito lento nas consultas'
);
// → Automaticamente roteado para DatabaseExpert
```

---

## 🔄 **EXTENSÃO 2: Enhanced Workflows - Conditional, Parallel, Loops**

### **Situação Atual**
- ✅ **Types** já existem em `/src/core/types/workflow-types.ts`
- ✅ **StepType** já tem `'condition' | 'parallel' | 'sequence'`
- ❌ **WorkflowEngine** atual só implementa sequential

### **Objetivo**
Estender o WorkflowEngine existente para suportar conditional, parallel, e loop steps usando os types que já existem.

### **Types Estendidos** (`/src/core/types/common-types.ts`)

```typescript
// Contexto de step melhorado
export interface EnhancedStepContext extends StepContext {
    // Navegação de steps
    getNextSteps(): string[];
    canExecuteStep(stepId: string): boolean;
    
    // Execução condicional
    evaluateCondition(condition: string | Function): Promise<boolean>;
    
    // Execução paralela
    executeParallel(stepIds: string[]): Promise<Record<string, unknown>>;
    
    // Sub-workflows
    executeSubWorkflow(workflowName: string, input: unknown): Promise<unknown>;
    
    // Estado compartilhado
    getWorkflowState(): Record<string, unknown>;
    setWorkflowState(state: Record<string, unknown>): void;
    
    // Eventos para coordenação
    emitEvent(eventType: string, data: unknown): void;
    waitForEvent(eventType: string, timeout?: number): Promise<unknown>;
}

// Estratégias de execução
export type StepExecutionStrategy = 
    | 'sequential'    // Um por vez
    | 'parallel'      // Todos em paralelo
    | 'conditional'   // Baseado em condições
    | 'dag';         // Directed Acyclic Graph

// Configuração do Enhanced Workflow
export interface EnhancedWorkflowConfig {
    defaultStrategy: StepExecutionStrategy;
    maxParallelSteps: number;
    stepTimeout: number;
    enableRetry: boolean;
    enableSnapshots: boolean;
    continueOnError: boolean;
    errorStrategy: 'fail_fast' | 'continue' | 'retry';
}
```

### **Compatibilidade**
- **Mantém** interface atual do WorkflowEngine
- **Estende** para usar `StepDefinition` de workflow-types.ts
- **Suporta** both simple Steps e enhanced StepDefinitions

### **Exemplo de Uso**

```typescript
// Workflow para correção de bugs
const bugFixWorkflow: WorkflowDefinition = {
    name: 'BugFixWorkflow',
    description: 'Workflow completo para correção de bugs',
    steps: {
        'analyze_issue': {
            type: 'agent',
            name: 'analyze_issue',
            config: { agentName: 'CodeAnalyzer' }
        },
        'plan_fix': {
            type: 'condition',
            name: 'plan_fix',
            condition: (context) => context.getState('hasCodeIssue'),
            next: { 
                'true': 'implement_tasks',
                'false': 'complete'
            }
        },
        'implement_tasks': {
            type: 'parallel',
            name: 'implement_tasks',
            config: {
                steps: ['fix_code', 'update_tests', 'update_docs']
            },
            next: 'create_pr'
        },
        'create_pr': {
            type: 'tool',
            name: 'create_pr',
            config: { toolName: 'github_pr_creator' }
        }
    },
    entryPoints: ['analyze_issue']
};

// Usar enhanced workflow
const result = await kodus.runWorkflow('BugFixWorkflow', {
    issueUrl: 'https://github.com/owner/repo/issues/123'
});
```

---

## 👥 **EXTENSÃO 3: Multi-Agent - Coordenação de Múltiplos Agentes**

### **Situação Atual**
- ✅ **Orchestration** já suporta múltiplos agentes (`this.agents.set()`)
- ❌ **AgentEngine** só processa um agente por vez (linha 104-106)
- 🔧 **Precisa**: Multi-Agent Engine para coordenação

### **Objetivo**
Estender AgentEngine para coordenar múltiplos agentes com estratégias de colaboração.

### **Types Criados** (`/src/core/types/common-types.ts`)

```typescript
// Estratégias de coordenação
export type AgentCoordinationStrategy =
    | 'sequential'       // Um por vez
    | 'parallel'         // Todos em paralelo
    | 'competitive'      // Competem, melhor resultado ganha
    | 'collaborative'    // Trabalham juntos, compartilham contexto
    | 'hierarchical'     // Agente líder coordena sub-agentes
    | 'consensus';       // Agentes votam nas decisões

// Mensagem entre agentes
export interface AgentMessage {
    id: string;
    fromAgent: string;
    toAgent?: string; // Se null, broadcast para todos
    messageType: 'request' | 'response' | 'notification' | 'coordination';
    content: unknown;
    correlationId?: string;
    timestamp: number;
}

// Contexto de coordenação
export interface MultiAgentContext {
    coordinationId: string;
    strategy: AgentCoordinationStrategy;
    
    // Agentes disponíveis
    availableAgents: string[];
    activeAgents: string[];
    
    // Recursos compartilhados
    sharedState: Record<string, unknown>;
    messageHistory: AgentMessage[];
    
    // Configurações
    maxParallelAgents: number;
    coordinationTimeout: number;
    enableCrossAgentCommunication: boolean;
}

// Resultado multi-agent
export interface MultiAgentResult {
    status: 'completed' | 'failed' | 'timeout' | 'delegated';
    result?: unknown;
    
    // Informações de coordenação
    executingAgent: string;
    involvedAgents: string[];
    strategy: AgentCoordinationStrategy;
    coordinationEvents: AgentMessage[];
    
    // Métricas
    totalTime: number;
    agentExecutionTimes: Record<string, number>;
    sharedState: Record<string, unknown>;
}

// Capacidades de agente
export interface AgentCapability {
    name: string;
    description: string;
    inputTypes: string[];
    outputTypes: string[];
    confidence: number; // 0-1
    cost: number;
    latency: number;
}
```

### **Integração com Orchestration**
- **Substitui** linha 104-106 em orchestration.ts
- **Mantém** interface `engine.withAgent()`
- **Adiciona** multi-agent coordination

### **Exemplo de Uso**

```typescript
// Configuração de agentes colaborativos
const multiAgentConfig = {
    strategy: 'collaborative' as AgentCoordinationStrategy,
    maxConcurrentAgents: 3,
    enableAgentCommunication: true,
    coordinationTimeout: 60000
};

// Agente Codex que coordena correção de bugs
const codexBugFixerAgent: AgentDefinition = {
    name: 'CodexBugFixer',
    type: 'collaborative',
    description: 'Agente autônomo que corrige bugs do GitHub do planejamento ao PR',
    think: async (input: { issueUrl: string }, context) => {
        const phase = context.getState('currentPhase') || 'planning';
        
        switch (phase) {
            case 'planning':
                return {
                    reasoning: 'Iniciando análise da issue para criar plano',
                    action: {
                        type: 'agent_call',
                        target: 'PlanningAgent',
                        input: { issueUrl: input.issueUrl }
                    }
                };
                
            case 'execution':
                return {
                    reasoning: 'Executando tarefas do plano com multiple agents',
                    action: {
                        type: 'coordinate_agents',
                        agents: ['TaskExecutorAgent', 'TestAgent', 'ReviewAgent'],
                        strategy: 'parallel',
                        input: context.getState('tasks')
                    }
                };
                
            case 'completion':
                return {
                    reasoning: 'Todas as tarefas concluídas, criando PR',
                    action: {
                        type: 'tool_call',
                        target: 'github_pr_creator',
                        input: context.getState('changes')
                    }
                };
        }
    }
};

// Usar multi-agent
const result = await kodus.runAgent('CodexBugFixer', {
    issueUrl: 'https://github.com/my-org/my-repo/issues/456'
}, { 
    multiAgent: multiAgentConfig 
});
```

---

## 🏢 **Integração com SaaS Multi-Cliente**

### **Exemplo Completo**

```typescript
class MySaaSIntegration {
    private kodusInstances = new Map<string, KodusFlow>();

    async getKodusForClient(clientId: string): Promise<KodusFlow> {
        if (!this.kodusInstances.has(clientId)) {
            const kodus = await createKodusFlow({
                tenant: { 
                    tenantId: `client-${clientId}`,
                    limits: {
                        maxEvents: 1000,
                        maxDuration: 300000,
                        rateLimit: { requestsPerMinute: 100 }
                    }
                },
                
                // Gateway inteligente
                gateway: supportGateway,
                
                // Agents com multi-agent support
                agents: [codexBugFixerAgent, codeAnalyzerAgent],
                multiAgent: multiAgentConfig,
                
                // Enhanced workflows
                workflows: [bugFixWorkflow],
                workflowConfig: enhancedWorkflowConfig
            });
            
            this.kodusInstances.set(clientId, kodus);
        }
        
        return this.kodusInstances.get(clientId)!;
    }

    async processClientRequest(clientId: string, request: unknown) {
        const kodus = await this.getKodusForClient(clientId);
        
        // Roteamento automático através do Gateway
        return await kodus.gateway('SupportGateway', request);
    }
}
```

---

## 📁 **Localização dos Códigos**

### **Types Criados**
- ✅ **Gateway types**: `/src/core/types/common-types.ts` (linhas 770-978)
- ✅ **Enhanced Workflow types**: `/src/core/types/common-types.ts` (linhas 980-1117)
- ✅ **Multi-Agent types**: `/src/core/types/common-types.ts` (linhas 1119-1325)

### **Error Codes**
- ✅ **GatewayErrorCode**: `/src/core/errors.ts` (linhas 60-70)
- ✅ **GatewayError class**: `/src/core/errors.ts` (linhas 225-238)
- ✅ **Error handling**: `/src/core/errors.ts` (linhas 341-357)

### **Implementações Futuras**
- 🔧 **Gateway Engine**: `/src/gateway/` (novo diretório)
- 🔧 **Enhanced WorkflowEngine**: estender `/src/engine/workflow-engine.ts`
- 🔧 **Multi-Agent Engine**: estender `/src/engine/agent-engine.ts`

---

## ✨ **Vantagens desta Arquitetura**

### **1. Aproveita Infraestrutura Robusta**
- **Observability** automática para todas as extensões
- **Error handling** tipado e resiliente
- **Context management** sofisticado
- **Circuit breakers** e middleware avançado

### **2. Extensões Bem Integradas**
- **Gateway** usa todo o sistema de orchestration
- **Enhanced Workflows** estende engine existente
- **Multi-Agent** aproveita agent system atual

### **3. Type Safety Completo**
- **Branded types** para identificadores únicos
- **Zod schemas** para validação runtime
- **Error codes** específicos para cada extensão

### **4. Pronto para Produção**
- **Multi-tenancy** nativo para SaaS
- **Performance monitoring** integrado
- **Snapshot/Resume** para workflows longos
- **Rate limiting** e resource management

Esta arquitetura permite evoluir desde agentes simples até sistemas complexos de IA colaborativa, mantendo a robustez necessária para produção enterprise.