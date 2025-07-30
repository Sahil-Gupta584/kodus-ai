# Kodus Flow Framework Evolution Guide

## 📋 Visão Geral

Este documento detalha a evolução do Kodus Flow SDK com 4 novas features principais que transformarão o framework em uma solução ainda mais poderosa para orquestração de agentes de IA:

1. **Multi-Agent Collaboration** - Comunicação e delegação entre agentes
2. **Human-in-the-Loop** - Integração de aprovação humana nos workflows
3. **Enhanced Streaming** - Streaming em tempo real do processo de raciocínio
4. **Agent Templates** - Templates pré-configurados para casos de uso comuns

---

## 🎯 Objetivos Estratégicos

### **Por que estas features?**
- **Diferencial competitivo** - Multi-agent collaboration é o futuro da IA
- **Enterprise readiness** - Human-in-the-loop é essencial para aplicações críticas
- **Developer experience** - Templates aceleram a adoção do SDK
- **User experience** - Streaming melhora a percepção de responsividade

### **Princípios de Design**
1. **Reutilizar infraestrutura existente** - Aproveitar event system, orchestration, etc.
2. **Backward compatibility** - Não quebrar código existente
3. **Progressive enhancement** - Features opcionais que não impactam performance
4. **Type safety** - Manter tipagem forte em todas as novas APIs

---

## 🤝 Feature 1: Multi-Agent Collaboration

### **Objetivo**
Permitir que agentes se comuniquem, deleguem tarefas e trabalhem em equipe para resolver problemas complexos.

### **Casos de Uso**
```typescript
// Supervisor delegando para especialistas
const supervisor = defineAgent({
  name: 'supervisor',
  think: async (input, ctx) => ({
    reasoning: 'Task requires research, delegating to research specialist',
    action: {
      type: 'delegate_to_agent',
      targetAgent: 'researcher',
      input: 'Research market trends for Q4'
    }
  })
});

// Agente pedindo ajuda para outro
const writer = defineAgent({
  name: 'writer',
  think: async (input, ctx) => ({
    reasoning: 'Need fact-checking before writing',
    action: {
      type: 'ask_agent',
      targetAgent: 'fact-checker',
      question: 'Is this data accurate?'
    }
  })
});
```

### **Arquitetura Existente que Vamos Usar**

#### **1. Event System (`src/runtime/index.ts`)**
```typescript
// ✅ JÁ EXISTE - Vamos reutilizar para comunicação entre agentes
const agentCommunicationEvent = workflowEvent<{
  fromAgent: string;
  toAgent: string;
  message: unknown;
  type: 'delegation' | 'question' | 'response';
}>('agent.communication');
```

#### **2. Orchestration Engine (`src/orchestration/orchestration.ts`)**
```typescript
// ✅ JÁ EXISTE - Já gerencia múltiplos agents, vamos estender
class OrchestrationEngine implements Engine {
  private agents: Map<string, AgentDefinition> = new Map(); // ✅ JÁ EXISTE
  
  // ✅ NOVO - Adicionar método para comunicação
  async delegateToAgent(fromAgent: string, toAgent: string, input: unknown) {
    // Usar orchestration existente
  }
}
```

### **O que Criar**

#### **1. Agent Collaboration Extension (`src/engine/agent-collaboration.ts`)**
```typescript
/**
 * Extensão para colaboração entre agentes
 * Reutiliza o sistema de eventos e orchestration existente
 */

import { workflowEvent } from '../runtime/index.js';
import type { AgentDefinition } from './improved-agent-engine.js';
import type { Engine } from '../orchestration/types.js';

// Novos tipos de eventos para comunicação
export const agentDelegationEvent = workflowEvent<{
  fromAgent: string;
  toAgent: string;
  task: unknown;
  correlationId: string;
}>('agent.delegation');

export const agentResponseEvent = workflowEvent<{
  fromAgent: string;
  toAgent: string;
  response: unknown;
  correlationId: string;
}>('agent.response');

// Registry para gerenciar comunicação entre agentes
export class AgentCollaborationManager {
  constructor(private engine: Engine) {}
  
  /**
   * Delega uma tarefa para outro agente
   * Usa o event system existente para comunicação assíncrona
   */
  async delegateTask(
    fromAgent: string,
    toAgent: string, 
    task: unknown
  ): Promise<unknown> {
    const correlationId = generateCorrelationId();
    
    // Emitir evento de delegação usando sistema existente
    await this.engine.sendEvent(
      agentDelegationEvent.with({
        fromAgent,
        toAgent,
        task,
        correlationId
      })
    );
    
    // Aguardar resposta usando event stream existente
    return new Promise((resolve) => {
      // Usar createContext() existente para escutar eventos
    });
  }
}

// Definir equipes de agentes com hierarquia
export interface AgentTeamConfig {
  supervisor: AgentDefinition;
  workers: Record<string, AgentDefinition>;
  workflow?: 'parallel' | 'sequential' | 'conditional';
}

export class AgentTeam {
  constructor(
    private config: AgentTeamConfig,
    private collaborationManager: AgentCollaborationManager
  ) {}
  
  async execute(input: unknown): Promise<unknown> {
    // Usar orchestration engine existente para coordenar equipe
  }
}
```

#### **2. Modificar Agent Engine (`src/engine/improved-agent-engine.ts`)**
```typescript
// ✅ MODIFICAR - Adicionar novos action types
export type AgentAction<TContent = unknown> =
  | { type: 'tool_call'; toolName: string; input: unknown }
  | { type: 'final_answer'; content: TContent }
  | { type: 'need_more_info'; question: string }
  // ✅ NOVOS TYPES
  | { type: 'delegate_to_agent'; targetAgent: string; input: unknown; priority?: 'high' | 'medium' | 'low' }
  | { type: 'ask_agent'; targetAgent: string; question: string; timeout?: number }
  | { type: 'broadcast_to_team'; message: unknown; excludeAgents?: string[] };

// ✅ MODIFICAR - Adicionar colaboração no processamento
export class AgentEngine {
  constructor(
    private definition: AgentDefinition,
    private toolEngine: ToolEngine,
    private collaborationManager?: AgentCollaborationManager, // ✅ NOVO
    config?: Partial<BaseEngineConfig>
  ) {
    // ... existing constructor
  }
  
  protected async executeCore(
    input: AgentInputEvent<TInput>,
    context: EngineContext,
  ): Promise<AgentOutputEvent<TOutput>> {
    // ... existing logic
    
    switch (thought.action.type) {
      // ... existing cases
      
      // ✅ NOVO - Delegação para outro agente
      case 'delegate_to_agent':
        if (!this.collaborationManager) {
          throw new Error('Collaboration manager not configured');
        }
        
        const delegationResult = await this.collaborationManager.delegateTask(
          this.definition.name,
          thought.action.targetAgent,
          thought.action.input
        );
        
        return {
          output: delegationResult as TOutput,
          reasoning: `${thought.reasoning} → Delegated to: ${thought.action.targetAgent}`,
          sessionId: input.sessionId,
        };
      
      // ✅ NOVO - Pergunta para outro agente
      case 'ask_agent':
        // Similar implementation
    }
  }
}
```

#### **3. Estender Orchestration (`src/orchestration/orchestration.ts`)**
```typescript
// ✅ MODIFICAR - Adicionar suporte a colaboração
import { AgentCollaborationManager, AgentTeam } from '../engine/agent-collaboration.js';

export class OrchestrationEngine implements Engine {
  private collaborationManager?: AgentCollaborationManager;
  
  /**
   * ✅ NOVO - Habilitar colaboração entre agentes
   */
  enableCollaboration(): Engine {
    this.collaborationManager = new AgentCollaborationManager(this);
    return this;
  }
  
  /**
   * ✅ NOVO - Adicionar agente com colaboração habilitada
   */
  withAgent(agent: AgentDefinition): Engine {
    this.agents.set(agent.name, agent);
    
    // Se colaboração estiver habilitada, usar collaboration manager
    if (this.collaborationManager) {
      this.agentEngine = new ImprovedAgentEngine(
        agent, 
        this.toolEngine,
        this.collaborationManager // ✅ PASSAR COLLABORATION MANAGER
      );
    } else {
      // Comportamento existente
      this.agentEngine = new ImprovedAgentEngine(agent, this.toolEngine);
    }
    
    return this;
  }
  
  /**
   * ✅ NOVO - Adicionar equipe de agentes
   */
  withAgentTeam(team: AgentTeam): Engine {
    // Registrar todos os agentes da equipe
    // Configurar workflows de colaboração
    return this;
  }
}
```

### **API de Uso**
```typescript
// Criar orchestration com colaboração
const orchestration = createOrchestration({
  debug: true
});

orchestration.createAgent(supervisorAgent);
orchestration.createAgent(researcherAgent);
orchestration.createAgent(writerAgent);

// Ou usar equipes pré-configuradas
const team = new AgentTeam({
  supervisor: supervisorAgent,
  workers: {
    researcher: researcherAgent,
    writer: writerAgent,
    reviewer: reviewerAgent
  },
  workflow: 'sequential'
});

const orchestration2 = createOrchestration({
  debug: true
});

orchestration2.createAgentTeam(team); // ✅ NOVO
```

---

## 👤 Feature 2: Human-in-the-Loop

### **Objetivo**
Integrar pontos de aprovação humana nos workflows, essencial para aplicações enterprise onde decisões críticas precisam de supervisão humana.

### **Casos de Uso**
```typescript
// Workflow que pausa para aprovação humana
const approvalWorkflow = defineWorkflow('approval-required')
  .step('analyze', analyzeStep)
  .step('human-review', humanApprovalStep) // ✅ NOVO
  .step('execute', executeStep)
  .build();

// Agent que pede aprovação antes de ações críticas
const cautiouxAgent = defineAgent({
  name: 'cautious-agent',
  think: async (input, ctx) => ({
    reasoning: 'This action requires human approval',
    action: {
      type: 'request_human_approval',
      message: 'About to delete 1000 records. Proceed?',
      options: ['yes', 'no'],
      timeout: 300000 // 5 minutes
    }
  })
});
```

### **Arquitetura Existente que Vamos Usar**

#### **1. Pause/Resume System (`src/runtime/index.ts`)**
```typescript
// ✅ JÁ EXISTE - Sistema de pause/resume perfeito para human-in-the-loop
async function pause(): Promise<void> {
  paused = true;
  // Workflow para e aguarda resume()
}

async function resume(): Promise<void> {
  if (!paused) return;
  paused = false;
  // Continua processamento
}
```

#### **2. Snapshot System (`src/kernel/snapshot.ts`)**
```typescript
// ✅ JÁ EXISTE - Para salvar estado durante aprovação
export interface Snapshot {
  id: string;
  workflowState: unknown;
  context: Record<string, unknown>;
  timestamp: number;
}
```

#### **3. Event System (`src/runtime/index.ts`)**
```typescript
// ✅ JÁ EXISTE - Para comunicar entre sistema e interface humana
const humanApprovalEvent = workflowEvent<{
  requestId: string;
  message: string;
  options?: string[];
}>('human.approval.request');
```

### **O que Criar**

#### **1. Human Approval Middleware (`src/runtime/middleware/human-approval.ts`)**
```typescript
/**
 * Middleware para aprovação humana
 * Reutiliza sistema de pause/resume e eventos existente
 */

import { workflowEvent } from '../index.js';
import type { WorkflowContext } from '../../core/types/common-types.js';

// Eventos para comunicação com interface humana
export const humanApprovalRequestEvent = workflowEvent<{
  requestId: string;
  message: string;
  context: unknown;
  options?: string[];
  timeout?: number;
}>('human.approval.request');

export const humanApprovalResponseEvent = workflowEvent<{
  requestId: string;
  approved: boolean;
  response?: string;
  timestamp: number;
}>('human.approval.response');

export interface HumanApprovalConfig {
  timeout?: number; // Default timeout em ms
  defaultApprover?: string; // User/role padrão
  escalationRules?: {
    timeoutAction: 'approve' | 'reject' | 'escalate';
    escalateTo?: string;
  };
}

/**
 * Middleware que pausa workflow para aprovação humana
 * Usa sistema de pause/resume existente
 */
export function createHumanApprovalMiddleware(config: HumanApprovalConfig = {}) {
  return function humanApprovalMiddleware(
    message: string,
    options?: {
      choices?: string[];
      timeout?: number;
      required?: boolean;
    }
  ) {
    return async (input: unknown, ctx: WorkflowContext) => {
      const requestId = generateRequestId();
      const timeout = options?.timeout || config.timeout || 300000; // 5 min default
      
      // Emitir evento de solicitação usando sistema existente
      ctx.emit(humanApprovalRequestEvent.with({
        requestId,
        message,
        context: input,
        options: options?.choices,
        timeout
      }));
      
      // Pausar workflow usando sistema existente
      const snapshotId = await ctx.pause(`human-approval:${requestId}`);
      
      // Aguardar resposta usando event stream existente
      return new Promise((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
          // Tratar timeout conforme configuração
          if (config.escalationRules?.timeoutAction === 'approve') {
            resolve(input);
          } else {
            reject(new Error('Human approval timeout'));
          }
        }, timeout);
        
        // Escutar resposta usando stream existente
        const subscription = ctx.stream
          .filter(humanApprovalResponseEvent.include)
          .until(ev => ev.data.requestId === requestId)
          .then(async ([response]) => {
            clearTimeout(timeoutHandle);
            
            if (response.data.approved) {
              resolve(response.data.response || input);
            } else {
              reject(new Error('Human approval denied'));
            }
            
            // Resumir workflow usando sistema existente
            await ctx.resume(snapshotId);
          });
      });
    };
  };
}

// Factory function para steps de aprovação
export function humanApprovalStep(
  message: string,
  options?: { choices?: string[]; timeout?: number }
) {
  const middleware = createHumanApprovalMiddleware();
  return middleware(message, options);
}
```

#### **2. Modificar Agent Engine (`src/engine/improved-agent-engine.ts`)**
```typescript
// ✅ MODIFICAR - Adicionar action type para aprovação humana
export type AgentAction<TContent = unknown> =
  | { type: 'tool_call'; toolName: string; input: unknown }
  | { type: 'final_answer'; content: TContent }
  | { type: 'need_more_info'; question: string }
  | { type: 'delegate_to_agent'; targetAgent: string; input: unknown }
  | { type: 'ask_agent'; targetAgent: string; question: string }
  // ✅ NOVO
  | { 
      type: 'request_human_approval'; 
      message: string; 
      options?: string[];
      timeout?: number;
      priority?: 'low' | 'medium' | 'high' | 'critical';
    };

// ✅ MODIFICAR - Processar aprovação humana
export class AgentEngine {
  protected async executeCore(
    input: AgentInputEvent<TInput>,
    context: EngineContext,
  ): Promise<AgentOutputEvent<TOutput>> {
    // ... existing logic
    
    switch (thought.action.type) {
      // ... existing cases
      
      // ✅ NOVO - Solicitação de aprovação humana
      case 'request_human_approval':
        const approvalResult = await this.requestHumanApproval(
          thought.action.message,
          {
            options: thought.action.options,
            timeout: thought.action.timeout,
            priority: thought.action.priority
          },
          context
        );
        
        return {
          output: approvalResult as TOutput,
          reasoning: `${thought.reasoning} → Human approval: ${approvalResult}`,
          sessionId: input.sessionId,
        };
    }
  }
  
  private async requestHumanApproval(
    message: string,
    options: { options?: string[]; timeout?: number; priority?: string },
    context: EngineContext
  ): Promise<unknown> {
    // Usar human approval middleware
    const approvalMiddleware = createHumanApprovalMiddleware();
    return approvalMiddleware(message, options);
  }
}
```

#### **3. Estender Workflow Engine (`src/engine/improved-workflow-engine.ts`)**
```typescript
// ✅ MODIFICAR - Adicionar suporte a steps interativos
import { humanApprovalStep } from '../runtime/middleware/human-approval.js';

export class WorkflowBuilder<TInput, TOutput> {
  // ... existing methods
  
  /**
   * ✅ NOVO - Step que requer aprovação humana
   */
  humanApprovalStep(
    stepName: string,
    message: string,
    options?: {
      choices?: string[];
      timeout?: number;
      required?: boolean;
    }
  ): WorkflowBuilder<TInput, TOutput> {
    const approvalHandler = humanApprovalStep(message, options);
    return this.step(stepName, approvalHandler);
  }
  
  /**
   * ✅ NOVO - Step interativo customizado
   */
  interactiveStep(
    stepName: string,
    handler: (input: unknown, ctx: WorkflowContext) => Promise<unknown>
  ): WorkflowBuilder<TInput, TOutput> {
    // Wrapper que adiciona capacidades de pause/resume
    const interactiveHandler = async (input: unknown, ctx: WorkflowContext) => {
      // Step pode usar ctx.pause() e ctx.resume() conforme necessário
      return handler(input, ctx);
    };
    
    return this.step(stepName, interactiveHandler);
  }
}
```

### **API de Uso**
```typescript
// Workflow com aprovação humana
const workflow = defineWorkflow('approval-workflow')
  .step('prepare', prepareData)
  .humanApprovalStep( // ✅ NOVO
    'approval', 
    'Approve batch deletion of 500 records?',
    { choices: ['approve', 'reject'], timeout: 300000 }
  )
  .step('execute', executeAction)
  .build();

// Agent que solicita aprovação
const agent = defineAgent({
  name: 'cautious-agent',
  think: async (input, ctx) => ({
    reasoning: 'Critical action requires approval',
    action: {
      type: 'request_human_approval', // ✅ NOVO
      message: 'About to make irreversible changes. Proceed?',
      options: ['yes', 'no'],
      priority: 'critical'
    }
  })
});
```

---

## 🌊 Feature 3: Enhanced Streaming

### **Objetivo**
Fornecer visibilidade em tempo real do processo de raciocínio dos agentes e execução de workflows, melhorando drasticamente a experiência do usuário.

### **Casos de Uso**
```typescript
// Streaming do processo de raciocínio do agente
const agent = new AgentEngine(agentDef, toolEngine);
const stream = agent.processStream('analyze this data');

for await (const chunk of stream) {
  console.log(`[${chunk.type}] ${chunk.content}`);
  // [reasoning] Analyzing the provided data...
  // [tool_call] Calling data-analyzer tool
  // [tool_result] Analysis complete: 85% confidence
  // [final_answer] Based on analysis...
}

// Streaming de workflow steps
const workflow = defineWorkflow('streaming-workflow')
  .step('fetch', fetchData)
  .step('process', processData)
  .step('output', formatOutput)
  .build();

const stream = workflow.executeStream(input);
for await (const chunk of stream) {
  console.log(`Step ${chunk.stepName}: ${chunk.status}`);
}
```

### **Arquitetura Existente que Vamos Usar**

#### **1. Event Stream System (`src/runtime/index.ts`)**
```typescript
// ✅ JÁ EXISTE - Sistema de streaming perfeito para reutilizar
export interface EventStream<S extends Event> {
  [Symbol.asyncIterator](): AsyncIterator<S>;
  filter<NS extends S>(pred: (e: S) => e is NS): EventStream<NS>;
  map<T extends Event>(m: (e: S) => T): EventStream<T>;
  until(p: EventPredicate | EventDef<unknown, string>): EventStream<S>;
  toArray(): Promise<S[]>;
}

function makeStream<S extends Event>(
  iter: () => AsyncGenerator<S>
): EventStream<S> {
  // ✅ JÁ IMPLEMENTADO - Vamos reutilizar para agent streaming
}
```

#### **2. Agent Context System (`src/engine/improved-agent-engine.ts`)**
```typescript
// ✅ JÁ EXISTE - Context que podemos estender para streaming
export interface AgentContext {
  executionId: string;
  correlationId: string;
  availableTools: Array<{/* ... */}>;
  state: Map<string, unknown>;
  logger: ReturnType<typeof createLogger>;
  // ✅ VAMOS ADICIONAR: streamEmitter
}
```

#### **3. Observability System (`src/observability/index.ts`)**
```typescript
// ✅ JÁ EXISTE - Telemetria que podemos usar para streaming
export interface TelemetrySystem {
  startSpan(name: string, attributes?: Record<string, unknown>): Span;
  // ✅ VAMOS USAR para rastrear cada step do reasoning
}
```

### **O que Criar**

#### **1. Agent Streaming System (`src/runtime/stream/agent-stream.ts`)**
```typescript
/**
 * Sistema de streaming para agentes
 * Reutiliza EventStream existente e sistema de observabilidade
 */

import { workflowEvent } from '../index.js';
import type { EventStream } from '../../core/types/common-types.js';
import { getTelemetry } from '../../observability/index.js';

// Eventos específicos para streaming de agentes
export const agentReasoningEvent = workflowEvent<{
  agentName: string;
  executionId: string;
  reasoning: string;
  step: number;
  timestamp: number;
}>('agent.reasoning');

export const agentActionEvent = workflowEvent<{
  agentName: string;
  executionId: string;
  action: {
    type: string;
    details: unknown;
  };
  timestamp: number;
}>('agent.action');

export const agentToolCallEvent = workflowEvent<{
  agentName: string;
  executionId: string;
  toolName: string;
  input: unknown;
  timestamp: number;
}>('agent.tool.call');

export const agentToolResultEvent = workflowEvent<{
  agentName: string;
  executionId: string;
  toolName: string;
  result: unknown;
  duration: number;
  timestamp: number;
}>('agent.tool.result');

// Tipos para chunks de streaming
export interface AgentStreamChunk {
  type: 'reasoning' | 'action' | 'tool_call' | 'tool_result' | 'final_answer' | 'error';
  agentName: string;
  executionId: string;
  content: unknown;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface WorkflowStreamChunk {
  type: 'step_start' | 'step_complete' | 'step_error' | 'workflow_complete';
  stepName: string;
  executionId: string;
  data?: unknown;
  duration?: number;
  timestamp: number;
}

/**
 * Streaming processor para agentes
 * Usa EventStream existente para distribuir eventos
 */
export class AgentStreamProcessor {
  constructor(
    private agentName: string,
    private executionId: string
  ) {}
  
  /**
   * Cria stream de eventos do agente
   * Reutiliza sistema EventStream existente
   */
  createAgentStream(): EventStream<AgentStreamChunk> {
    // Usar makeStream existente para criar stream customizado
    return makeStream<AgentStreamChunk>(async function* () {
      // Generator que escuta eventos de reasoning/action/tools
      // e converte para AgentStreamChunk
    });
  }
  
  /**
   * Emite evento de reasoning
   * Usa sistema de eventos existente
   */
  emitReasoning(reasoning: string, step: number): void {
    emit(agentReasoningEvent.with({
      agentName: this.agentName,
      executionId: this.executionId,
      reasoning,
      step,
      timestamp: Date.now()
    }));
  }
  
  /**
   * Emite evento de ação
   */
  emitAction(action: { type: string; details: unknown }): void {
    emit(agentActionEvent.with({
      agentName: this.agentName,
      executionId: this.executionId,
      action,
      timestamp: Date.now()
    }));
  }
  
  /**
   * Emite eventos de tool call
   */
  emitToolCall(toolName: string, input: unknown): void {
    emit(agentToolCallEvent.with({
      agentName: this.agentName,
      executionId: this.executionId,
      toolName,
      input,
      timestamp: Date.now()
    }));
  }
  
  emitToolResult(toolName: string, result: unknown, duration: number): void {
    emit(agentToolResultEvent.with({
      agentName: this.agentName,
      executionId: this.executionId,
      toolName,
      result,
      duration,
      timestamp: Date.now()
    }));
  }
}

/**
 * Streaming processor para workflows
 */
export class WorkflowStreamProcessor {
  constructor(private executionId: string) {}
  
  createWorkflowStream(): EventStream<WorkflowStreamChunk> {
    // Similar ao AgentStreamProcessor, mas para workflow steps
  }
}
```

#### **2. Modificar Agent Engine (`src/engine/improved-agent-engine.ts`)**
```typescript
// ✅ MODIFICAR - Adicionar streaming ao AgentEngine
import { 
  AgentStreamProcessor, 
  type AgentStreamChunk 
} from '../runtime/stream/agent-stream.js';

export interface AgentContext {
  executionId: string;
  correlationId: string;
  availableTools: Array<{/* ... */}>;
  state: Map<string, unknown>;
  logger: ReturnType<typeof createLogger>;
  // ✅ NOVO - Stream processor para emitir eventos
  streamProcessor?: AgentStreamProcessor;
}

export class AgentEngine {
  constructor(
    private definition: AgentDefinition,
    private toolEngine: ToolEngine,
    private collaborationManager?: AgentCollaborationManager,
    config?: Partial<BaseEngineConfig> & {
      enableStreaming?: boolean; // ✅ NOVO
    }
  ) {
    // ... existing constructor
    this.streamingEnabled = config?.enableStreaming || false;
  }
  
  /**
   * ✅ NOVO - Versão streaming do process
   */
  async *processStream(
    input: TInput,
    sessionId?: string
  ): AsyncGenerator<AgentStreamChunk> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const streamProcessor = new AgentStreamProcessor(this.definition.name, executionId);
    
    // Criar context com stream processor
    const agentContext: AgentContext = {
      executionId,
      correlationId: `corr_${Date.now()}`,
      availableTools: this.toolEngine.getAvailableTools(),
      state: new Map(),
      logger: this.logger,
      streamProcessor // ✅ ADICIONAR stream processor
    };
    
    try {
      // Emitir início do reasoning
      streamProcessor.emitReasoning('Starting to think...', 0);
      yield {
        type: 'reasoning',
        agentName: this.definition.name,
        executionId,
        content: 'Starting to think...',
        timestamp: Date.now()
      };
      
      // Chamar think function do agente
      const thought = await this.definition.think(input, agentContext);
      
      // Emitir reasoning
      streamProcessor.emitReasoning(thought.reasoning, 1);
      yield {
        type: 'reasoning',
        agentName: this.definition.name,
        executionId,
        content: thought.reasoning,
        timestamp: Date.now()
      };
      
      // Emitir action
      streamProcessor.emitAction(thought.action);
      yield {
        type: 'action',
        agentName: this.definition.name,
        executionId,
        content: thought.action,
        timestamp: Date.now()
      };
      
      // Processar action com streaming
      switch (thought.action.type) {
        case 'tool_call':
          // Emitir tool call
          streamProcessor.emitToolCall(thought.action.toolName, thought.action.input);
          yield {
            type: 'tool_call',
            agentName: this.definition.name,
            executionId,
            content: {
              toolName: thought.action.toolName,
              input: thought.action.input
            },
            timestamp: Date.now()
          };
          
          const toolStart = Date.now();
          const toolResult = await this.toolEngine.executeCall(
            thought.action.toolName,
            thought.action.input
          );
          const toolDuration = Date.now() - toolStart;
          
          // Emitir tool result
          streamProcessor.emitToolResult(thought.action.toolName, toolResult, toolDuration);
          yield {
            type: 'tool_result',
            agentName: this.definition.name,
            executionId,
            content: toolResult,
            timestamp: Date.now(),
            metadata: { duration: toolDuration }
          };
          break;
          
        case 'final_answer':
          yield {
            type: 'final_answer',
            agentName: this.definition.name,
            executionId,
            content: thought.action.content,
            timestamp: Date.now()
          };
          break;
      }
      
    } catch (error) {
      yield {
        type: 'error',
        agentName: this.definition.name,
        executionId,
        content: error,
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * ✅ MODIFICAR - Adicionar streaming ao think process existente
   */
  private async thinkWithProtection(
    input: TInput,
    agentContext: AgentContext,
    stateNamespace: string,
    stateManager: StateManager,
  ): Promise<AgentThought<TContent>> {
    // ... existing logic
    
    // ✅ ADICIONAR - Emitir evento se streaming habilitado
    if (agentContext.streamProcessor) {
      agentContext.streamProcessor.emitReasoning(
        `Thinking iteration ${iterations + 1}`,
        iterations
      );
    }
    
    const thinkingPromise = this.definition.think(input, agentContext);
    const thought = await Promise.race([thinkingPromise, timeoutPromise]);
    
    // ✅ ADICIONAR - Emitir resultado do thinking
    if (agentContext.streamProcessor) {
      agentContext.streamProcessor.emitReasoning(
        thought.reasoning,
        iterations + 1
      );
    }
    
    // ... rest of existing logic
  }
}
```

#### **3. Modificar Orchestration (`src/orchestration/types.ts`)**
```typescript
// ✅ MODIFICAR - Adicionar streaming options
export interface ExecutionOptions {
  timeout?: number;
  context?: Record<string, unknown>;
  streaming?: boolean; // ✅ JÁ EXISTE
  // ✅ NOVO - Handlers para diferentes tipos de stream
  onAgentStream?: (chunk: AgentStreamChunk) => void;
  onWorkflowStream?: (chunk: WorkflowStreamChunk) => void;
  onError?: (error: unknown) => void;
}

// ✅ NOVO - Resultado com stream
export interface StreamingExecutionResult<T = unknown> extends ExecutionResult<T> {
  stream?: AsyncGenerator<AgentStreamChunk | WorkflowStreamChunk>;
}
```

### **API de Uso**
```typescript
// Agent streaming
const agent = new AgentEngine(agentDef, toolEngine, undefined, {
  enableStreaming: true // ✅ NOVO
});

const stream = agent.processStream('analyze this data');
for await (const chunk of stream) {
  switch (chunk.type) {
    case 'reasoning':
      console.log(`💭 ${chunk.content}`);
      break;
    case 'tool_call':
      console.log(`🔧 Calling ${chunk.content.toolName}`);
      break;
    case 'final_answer':
      console.log(`✅ ${chunk.content}`);
      break;
  }
}

// Engine streaming
const result = await engine.run(input, {
  streaming: true,
  onAgentStream: (chunk) => {
    console.log(`[${chunk.agentName}] ${chunk.content}`);
  }
});
```

---

## 📋 Feature 4: Agent Templates

### **Objetivo**
Acelerar a adoção do SDK fornecendo templates pré-configurados para casos de uso comuns, com melhores práticas já implementadas.

### **Casos de Uso**
```typescript
// Criar agente a partir de template
const researcher = createAgentFromTemplate('researcher', {
  domain: 'technology',
  sources: ['web', 'academic-papers'],
  language: 'pt-BR'
});

// Customizar template existente
const codeReviewer = createAgentFromTemplate('code-reviewer', {
  languages: ['typescript', 'python'],
  rules: ['security', 'performance', 'style'],
  severity: 'strict'
});

// Criar template personalizado
const customTemplate = defineAgentTemplate({
  name: 'customer-service',
  description: 'Customer service assistant',
  category: 'support',
  requiredTools: ['crm-lookup', 'ticket-system'],
  defaultConfig: {
    think: async (input, ctx) => {
      // Template logic
    }
  }
});
```

### **Arquitetura Existente que Vamos Usar**

#### **1. Agent Definition System (`src/engine/improved-agent-engine.ts`)**
```typescript
// ✅ JÁ EXISTE - Interface AgentDefinition perfeita para templates
export interface AgentDefinition<TInput, TOutput, TContent> {
  name: string;
  description: string;
  think: (input: TInput, context: AgentContext) => Promise<AgentThought<TContent>>;
  formatResponse?: (thought: AgentThought<TContent>) => TOutput;
}

// ✅ JÁ EXISTE - Factory function que vamos estender
export function defineAgent<TInput, TOutput, TContent>(
  definition: AgentDefinition<TInput, TOutput, TContent>
): AgentDefinition<TInput, TOutput, TContent> {
  return definition;
}
```

#### **2. Tool System (`src/engine/improved-tool-engine.ts`)**
```typescript
// ✅ JÁ EXISTE - Sistema de tools que templates podem usar
export interface BaseToolDefinition {
  name: string;
  description: string;
  execute: (input: unknown) => Promise<unknown>;
}

// ✅ JÁ EXISTE - Registry de tools que templates podem referenciar
export class ToolEngine {
  registerTool(tool: BaseToolDefinition): void;
  getTool(name: string): BaseToolDefinition | undefined;
}
```

#### **3. Zod Validation (`src/engine/improved-tool-engine.ts`)**
```typescript
// ✅ JÁ EXISTE - Sistema de validação para parâmetros de template
import { z } from 'zod';
```

### **O que Criar**

#### **1. Agent Templates System (`src/engine/agent-templates.ts`)**
```typescript
/**
 * Sistema de templates para agentes
 * Reutiliza AgentDefinition e sistema de tools existente
 */

import { z } from 'zod';
import { defineAgent, type AgentDefinition } from './improved-agent-engine.js';
import type { BaseToolDefinition } from './improved-tool-engine.js';

// Schema para configuração de template
export const agentTemplateConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  category: z.enum(['research', 'code', 'support', 'analysis', 'creative', 'custom']),
  version: z.string().default('1.0.0'),
  author: z.string().optional(),
  tags: z.array(z.string()).default([]),
  requiredTools: z.array(z.string()).default([]),
  optionalTools: z.array(z.string()).default([]),
  configSchema: z.record(z.unknown()).optional(),
  examples: z.array(z.object({
    input: z.unknown(),
    expectedOutput: z.unknown(),
    description: z.string().optional()
  })).default([]),
});

export type AgentTemplateConfig = z.infer<typeof agentTemplateConfigSchema>;

// Interface para template de agente
export interface AgentTemplate<TConfig = Record<string, unknown>> {
  config: AgentTemplateConfig;
  
  /**
   * Factory function que cria AgentDefinition
   * Reutiliza estrutura existente do AgentDefinition
   */
  createAgent(customConfig?: Partial<TConfig>): AgentDefinition;
  
  /**
   * Validar se tools necessários estão disponíveis
   */
  validateDependencies(availableTools: string[]): {
    valid: boolean;
    missing: string[];
    optional: string[];
  };
  
  /**
   * Obter configuração padrão mesclada com customizações
   */
  mergeConfig(customConfig?: Partial<TConfig>): TConfig;
}

/**
 * Registry de templates built-in e customizados
 */
export class AgentTemplateRegistry {
  private templates = new Map<string, AgentTemplate>();
  
  register(name: string, template: AgentTemplate): void {
    this.templates.set(name, template);
  }
  
  get(name: string): AgentTemplate | undefined {
    return this.templates.get(name);
  }
  
  list(): Array<{ name: string; config: AgentTemplateConfig }> {
    return Array.from(this.templates.entries()).map(([name, template]) => ({
      name,
      config: template.config
    }));
  }
  
  search(category?: string, tags?: string[]): Array<{ name: string; config: AgentTemplateConfig }> {
    return this.list().filter(({ config }) => {
      if (category && config.category !== category) return false;
      if (tags && !tags.some(tag => config.tags.includes(tag))) return false;
      return true;
    });
  }
}

// Global registry instance
const globalTemplateRegistry = new AgentTemplateRegistry();

/**
 * Helper function para definir templates
 * Usa AgentDefinition existente como base
 */
export function defineAgentTemplate<TConfig = Record<string, unknown>>(
  config: AgentTemplateConfig,
  factory: (config: TConfig) => AgentDefinition
): AgentTemplate<TConfig> {
  return {
    config,
    
    createAgent(customConfig?: Partial<TConfig>): AgentDefinition {
      const mergedConfig = this.mergeConfig(customConfig);
      
      // Usar defineAgent existente
      return defineAgent(factory(mergedConfig));
    },
    
    validateDependencies(availableTools: string[]) {
      const missing = config.requiredTools.filter(tool => !availableTools.includes(tool));
      const optionalMissing = config.optionalTools.filter(tool => !availableTools.includes(tool));
      
      return {
        valid: missing.length === 0,
        missing,
        optional: optionalMissing
      };
    },
    
    mergeConfig(customConfig?: Partial<TConfig>): TConfig {
      // Deep merge da configuração padrão com customizações
      return {
        ...this.getDefaultConfig(),
        ...customConfig
      } as TConfig;
    },
    
    getDefaultConfig(): TConfig {
      // Configuração padrão baseada no template
      return {} as TConfig;
    }
  };
}

/**
 * Factory function para criar agente a partir de template
 * Reutiliza sistema existente completamente
 */
export function createAgentFromTemplate<TConfig = Record<string, unknown>>(
  templateName: string,
  customConfig?: Partial<TConfig>
): AgentDefinition {
  const template = globalTemplateRegistry.get(templateName);
  if (!template) {
    throw new Error(`Template '${templateName}' not found. Available templates: ${
      globalTemplateRegistry.list().map(t => t.name).join(', ')
    }`);
  }
  
  return template.createAgent(customConfig);
}

// ===== BUILT-IN TEMPLATES =====

/**
 * Template: Research Assistant
 * Especializado em pesquisa e coleta de informações
 */
export const researcherTemplate = defineAgentTemplate(
  {
    name: 'researcher',
    description: 'AI assistant specialized in research and information gathering',
    category: 'research',
    requiredTools: ['web-search'],
    optionalTools: ['document-reader', 'academic-search', 'data-extractor'],
    configSchema: z.object({
      domain: z.string().default('general'),
      sources: z.array(z.string()).default(['web']),
      language: z.string().default('en'),
      depth: z.enum(['surface', 'deep', 'comprehensive']).default('deep'),
      citations: z.boolean().default(true)
    })
  },
  (config) => ({
    name: `researcher-${config.domain}`,
    description: `Research assistant for ${config.domain} domain`,
    
    async think(input: string, ctx) {
      const query = `${input} domain:${config.domain} lang:${config.language}`;
      
      return {
        reasoning: `I need to research "${input}" in the ${config.domain} domain using ${config.sources.join(', ')} sources`,
        action: {
          type: 'tool_call',
          toolName: 'web-search',
          input: {
            query,
            sources: config.sources,
            depth: config.depth,
            citations: config.citations
          }
        }
      };
    }
  })
);

/**
 * Template: Code Reviewer
 * Especializado em análise e revisão de código
 */
export const codeReviewerTemplate = defineAgentTemplate(
  {
    name: 'code-reviewer',
    description: 'AI assistant specialized in code review and analysis',
    category: 'code',
    requiredTools: ['code-analyzer'],
    optionalTools: ['security-scanner', 'test-generator', 'documentation-generator'],
    configSchema: z.object({
      languages: z.array(z.string()).default(['javascript', 'typescript']),
      rules: z.array(z.string()).default(['style', 'performance', 'security']),
      severity: z.enum(['strict', 'moderate', 'lenient']).default('moderate'),
      autofix: z.boolean().default(false)
    })
  },
  (config) => ({
    name: `code-reviewer-${config.languages.join('-')}`,
    description: `Code reviewer for ${config.languages.join(', ')} with ${config.severity} rules`,
    
    async think(input: string, ctx) {
      // Input deveria ser código para analisar
      return {
        reasoning: `I need to analyze this ${config.languages.includes('typescript') ? 'TypeScript' : 'code'} following ${config.rules.join(', ')} rules with ${config.severity} severity`,
        action: {
          type: 'tool_call',
          toolName: 'code-analyzer',
          input: {
            code: input,
            languages: config.languages,
            rules: config.rules,
            severity: config.severity,
            autofix: config.autofix
          }
        }
      };
    }
  })
);

/**
 * Template: Customer Support
 * Especializado em atendimento ao cliente
 */
export const customerSupportTemplate = defineAgentTemplate(
  {
    name: 'customer-support',
    description: 'AI assistant for customer service and support',
    category: 'support',
    requiredTools: ['knowledge-base'],
    optionalTools: ['crm-lookup', 'ticket-system', 'escalation-manager'],
    configSchema: z.object({
      tone: z.enum(['formal', 'friendly', 'casual']).default('friendly'),
      language: z.string().default('en'),
      escalationRules: z.object({
        maxAttempts: z.number().default(3),
        keywords: z.array(z.string()).default(['refund', 'complaint', 'manager'])
      }).optional(),
      responseTime: z.enum(['immediate', 'fast', 'standard']).default('fast')
    })
  },
  (config) => ({
    name: `support-agent-${config.language}`,
    description: `Customer support agent with ${config.tone} tone in ${config.language}`,
    
    async think(input: string, ctx) {
      // Detectar se precisa de escalation
      const needsEscalation = config.escalationRules?.keywords.some(
        keyword => input.toLowerCase().includes(keyword)
      );
      
      if (needsEscalation) {
        return {
          reasoning: `Customer inquiry contains escalation keywords, consulting knowledge base first`,
          action: {
            type: 'tool_call',
            toolName: 'knowledge-base',
            input: {
              query: input,
              priority: 'high',
              escalation: true
            }
          }
        };
      }
      
      return {
        reasoning: `Standard customer inquiry, searching knowledge base for relevant information`,
        action: {
          type: 'tool_call',
          toolName: 'knowledge-base',
          input: {
            query: input,
            tone: config.tone,
            language: config.language
          }
        }
      };
    }
  })
);

/**
 * Template: Data Analyst
 * Especializado em análise de dados
 */
export const dataAnalystTemplate = defineAgentTemplate(
  {
    name: 'data-analyst',
    description: 'AI assistant specialized in data analysis and insights',
    category: 'analysis',
    requiredTools: ['data-processor'],
    optionalTools: ['chart-generator', 'statistical-analyzer', 'report-generator'],
    configSchema: z.object({
      analysisType: z.enum(['descriptive', 'inferential', 'predictive']).default('descriptive'),
      outputFormat: z.enum(['summary', 'detailed', 'visual']).default('summary'),
      confidence: z.number().min(0).max(1).default(0.95),
      includeVisualization: z.boolean().default(true)
    })
  },
  (config) => ({
    name: `data-analyst-${config.analysisType}`,
    description: `Data analyst specialized in ${config.analysisType} analysis`,
    
    async think(input: unknown, ctx) {
      return {
        reasoning: `I need to perform ${config.analysisType} analysis on the provided data with ${config.confidence * 100}% confidence level`,
        action: {
          type: 'tool_call',
          toolName: 'data-processor',
          input: {
            data: input,
            analysisType: config.analysisType,
            outputFormat: config.outputFormat,
            confidence: config.confidence,
            includeVisualization: config.includeVisualization
          }
        }
      };
    }
  })
);

// Registrar templates built-in
globalTemplateRegistry.register('researcher', researcherTemplate);
globalTemplateRegistry.register('code-reviewer', codeReviewerTemplate);
globalTemplateRegistry.register('customer-support', customerSupportTemplate);
globalTemplateRegistry.register('data-analyst', dataAnalystTemplate);

// Export registry para uso externo
export { globalTemplateRegistry as templateRegistry };
```

#### **2. Modificar Orchestration (`src/orchestration/orchestration.ts`)**
```typescript
// ✅ MODIFICAR - Adicionar suporte a templates
import { createAgentFromTemplate, templateRegistry } from '../engine/agent-templates.js';

export class OrchestrationEngine implements Engine {
  // ... existing methods
  
  /**
   * ✅ NOVO - Adicionar agente a partir de template
   */
  withAgentFromTemplate<TConfig = Record<string, unknown>>(
    templateName: string,
    customConfig?: Partial<TConfig>
  ): Engine {
    const agent = createAgentFromTemplate(templateName, customConfig);
    return this.withAgent(agent);
  }
  
  /**
   * ✅ NOVO - Listar templates disponíveis
   */
  listAvailableTemplates(): Array<{ name: string; description: string; category: string }> {
    return templateRegistry.list().map(({ name, config }) => ({
      name,
      description: config.description,
      category: config.category
    }));
  }
  
  /**
   * ✅ NOVO - Validar dependências de template
   */
  validateTemplateForEngine(templateName: string): {
    valid: boolean;
    missing: string[];
    available: string[];
  } {
    const template = templateRegistry.get(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }
    
    const availableTools = Array.from(this.tools.keys());
    const validation = template.validateDependencies(availableTools);
    
    return {
      valid: validation.valid,
      missing: validation.missing,
      available: availableTools
    };
  }
}
```

#### **3. Estender Factory Functions (`src/orchestration/index.ts`)**
```typescript
// ✅ MODIFICAR - Adicionar factories com templates
import { createAgentFromTemplate } from '../engine/agent-templates.js';

/**
 * ✅ NOVO - Criar engine com agente a partir de template
 */
export function createEngineWithTemplate(
  tenantId: string,
  templateName: string,
  templateConfig?: Record<string, unknown>
): Orchestration {
  const agent = createAgentFromTemplate(templateName, templateConfig);
  
  const orchestration = createOrchestration({
    tenant: { tenantId }
  });
  
  orchestration.createAgent(agent);
  return orchestration;
}

/**
 * ✅ NOVO - Criar múltiplos agentes a partir de templates
 */
export function createEngineWithTemplates(
  tenantId: string,
  templates: Array<{
    template: string;
    config?: Record<string, unknown>;
    tools?: string[];
  }>
): Orchestration {
  const orchestration = createOrchestration({
    tenant: { tenantId }
  });
  
  for (const { template, config, tools } of templates) {
    const agent = createAgentFromTemplate(template, config);
    orchestration.createAgent(agent);
    
    // Adicionar tools específicas se especificadas
    if (tools) {
      // Assumindo que há um registry de tools disponível
      // tools.forEach(toolName => orchestration.createTool(getToolByName(toolName)));
    }
  }
  
  return orchestration;
}
```

### **API de Uso**
```typescript
// Usar template built-in
const researcher = createAgentFromTemplate('researcher', {
  domain: 'technology',
  sources: ['web', 'academic-papers'],
  language: 'pt-BR'
});

// Criar engine com template
const orchestration = createEngineWithTemplate('research-tenant', 'researcher', {
  domain: 'artificial-intelligence',
  depth: 'comprehensive'
});

// Múltiplos templates
const multiAgentOrchestration = createEngineWithTemplates('multi-tenant', [
  {
    template: 'researcher',
    config: { domain: 'tech' }
  },
  {
    template: 'code-reviewer',
    config: { languages: ['typescript'], severity: 'strict' }
  },
  {
    template: 'customer-support',
    config: { tone: 'friendly', language: 'pt-BR' }
  }
]);

// Definir template customizado
const customTemplate = defineAgentTemplate(
  {
    name: 'legal-assistant',
    description: 'Legal document analysis assistant',
    category: 'custom',
    requiredTools: ['legal-database', 'document-parser']
  },
  (config) => ({
    name: 'legal-assistant',
    description: 'Analyzes legal documents',
    think: async (input, ctx) => ({
      reasoning: 'Analyzing legal document for compliance',
      action: {
        type: 'tool_call',
        toolName: 'legal-database',
        input: { document: input, jurisdiction: config.jurisdiction }
      }
    })
  })
);

// Registrar e usar
templateRegistry.register('legal-assistant', customTemplate);
const legalAgent = createAgentFromTemplate('legal-assistant', {
  jurisdiction: 'BR'
});
```

---

## 🗂️ Estrutura Final de Arquivos

### **Novos Arquivos**
```
src/
├── engine/
│   ├── agent-collaboration.ts      # Multi-agent collaboration
│   └── agent-templates.ts          # Agent templates system
├── runtime/
│   ├── middleware/
│   │   └── human-approval.ts       # Human-in-the-loop middleware
│   └── stream/
│       └── agent-stream.ts         # Enhanced streaming
```

### **Arquivos Modificados**
```
src/
├── engine/
│   ├── improved-agent-engine.ts    # + collaboration, streaming, human approval
│   └── improved-workflow-engine.ts # + interactive steps
├── orchestration/
│   ├── types.ts                    # + new interfaces, status types
│   ├── orchestration.ts            # + collaboration, templates, streaming
│   └── index.ts                    # + new factory functions
└── index.ts                        # + exports for new features
```

---

## 📋 Plano de Implementação

### **Fase 1: Agent Templates (1-2 semanas)**
- ✅ **Menor complexidade, maior valor imediato**
- Criar `src/engine/agent-templates.ts`
- Implementar templates built-in (researcher, code-reviewer, etc.)
- Estender factory functions
- Testes e documentação

### **Fase 2: Human-in-the-Loop (2-3 semanas)**
- ✅ **Reutiliza pause/resume existente**
- Criar `src/runtime/middleware/human-approval.ts`
- Modificar `AgentEngine` para novos action types
- Estender `WorkflowBuilder` com steps interativos
- Integração com interfaces externas

### **Fase 3: Enhanced Streaming (3-4 semanas)**
- ✅ **Reutiliza EventStream existente**
- Criar `src/runtime/stream/agent-stream.ts`
- Modificar `AgentEngine` para streaming
- Implementar workflow streaming
- Otimizações de performance

### **Fase 4: Multi-Agent Collaboration (4-5 semanas)**
- ✅ **Mais complexa, mas maior diferencial**
- Criar `src/engine/agent-collaboration.ts`