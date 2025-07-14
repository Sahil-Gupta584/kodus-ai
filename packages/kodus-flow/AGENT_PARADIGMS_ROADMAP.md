# Kodus Flow Agent Paradigms & Architecture Roadmap

## 📋 Visão Geral

Este documento define a roadmap para implementar suporte completo aos diferentes paradigmas e arquiteturas de agentes no Kodus Flow SDK. O objetivo é transformar o framework em uma solução universal que suporte desde agentes determinísticos simples até sistemas complexos de swarm intelligence e agentes autônomos com capacidades de aprendizado.

---

## 🎯 Paradigmas de Agentes e Gaps Atuais

### **Estado Atual do Kodus Flow**

#### ✅ **O que já temos:**
- Event-driven architecture com runtime robusto
- Agent engine básico com think-act cycle
- Tool integration e orchestration
- State management e persistence
- Multi-tenancy e resource limits
- Observability e telemetry
- Circuit breaker e error handling
- Pause/resume functionality
- Foundation para memory types

#### ❌ **O que está faltando:**
- Arquiteturas avançadas (BDI, FSM, Layered)
- Sistemas de memória sofisticados
- Capacidades de aprendizado
- Modelos emocionais e personalidade
- Swarm intelligence
- Comunicação inter-agente avançada
- Self-reflection e meta-cognição

---

## 🧠 Feature 1: BDI Architecture (Belief-Desire-Intention)

### **Objetivo**
Implementar arquitetura BDI completa para suportar agentes autônomos, goal-oriented e deliberativos que podem planejar, formar intenções e agir baseado em crenças sobre o mundo.

### **Casos de Uso**
```typescript
// Agente autônomo com goals e crenças
const autonomousAgent = defineBDIAgent({
  name: 'resource-optimizer',
  
  beliefs: {
    initial: {
      'system.cpu_usage': 0.7,
      'system.memory_usage': 0.5,
      'cost.current_month': 1500,
      'performance.response_time': 200
    }
  },
  
  desires: [
    { 
      goal: 'minimize_costs',
      priority: 'high',
      target: { 'cost.current_month': { operator: '<', value: 1200 } }
    },
    {
      goal: 'maintain_performance', 
      priority: 'critical',
      target: { 'performance.response_time': { operator: '<', value: 300 } }
    }
  ],
  
  plans: [
    {
      name: 'scale_down_plan',
      trigger: { 
        goal: 'minimize_costs',
        belief: { 'system.cpu_usage': { operator: '<', value: 0.5 } }
      },
      actions: [
        { type: 'tool_call', toolName: 'infrastructure-scaler', input: { action: 'scale_down' } }
      ],
      preconditions: ['system.health === "good"'],
      effects: ['cost.current_month -= 200', 'system.capacity *= 0.8']
    },
    {
      name: 'optimize_queries_plan',
      trigger: { goal: 'maintain_performance' },
      actions: [
        { type: 'tool_call', toolName: 'query-optimizer', input: { target: 'slow_queries' } }
      ]
    }
  ],
  
  reasoning: {
    planSelection: 'utility-based', // utility-based, priority-based, etc.
    beliefRevision: 'minimal-change',
    commitmentStrategy: 'single-minded' // single-minded, open-minded, etc.
  }
});
```

### **Arquitetura Existente que Vamos Usar**

#### **1. State Management (`src/utils/thread-safe-state.ts`)**
```typescript
// ✅ JÁ EXISTE - Vamos usar para Belief System
export interface StateManager {
  get<T>(namespace: string, key: string): Promise<T | undefined>;
  set<T>(namespace: string, key: string, value: T): Promise<void>;
  // ✅ PERFEITO para armazenar beliefs e intentions
}
```

#### **2. Event System (`src/runtime/index.ts`)**
```typescript
// ✅ JÁ EXISTE - Para disparar planos baseado em mudanças de belief
const beliefChangeEvent = workflowEvent<{
  belief: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
}>('bdi.belief.changed');
```

#### **3. Agent Engine (`src/engine/improved-agent-engine.ts`)**
```typescript
// ✅ JÁ EXISTE - Vamos estender para BDI reasoning
export interface AgentContext {
  // ✅ VAMOS ADICIONAR
  beliefs?: BeliefSystem;
  desires?: DesireSystem;
  intentions?: IntentionSystem;
  planLibrary?: PlanLibrary;
}
```

### **O que Criar**

#### **1. BDI Core System (`src/engine/bdi/index.ts`)**
```typescript
/**
 * BDI (Belief-Desire-Intention) Architecture Implementation
 * Reutiliza StateManager e Event System existente
 */

import { workflowEvent } from '../../runtime/index.js';
import type { StateManager } from '../../utils/thread-safe-state.js';
import type { AgentDefinition, AgentContext } from '../improved-agent-engine.js';

// ===== BELIEF SYSTEM =====

export interface Belief {
  key: string;
  value: unknown;
  confidence: number; // 0-1
  source: string;
  timestamp: number;
  expiry?: number; // Optional expiration
}

export interface BeliefUpdate {
  key: string;
  value: unknown;
  source: string;
  confidence?: number;
}

export class BeliefSystem {
  constructor(
    private stateManager: StateManager,
    private namespace: string,
    private eventEmitter?: (event: any) => void
  ) {}
  
  /**
   * Atualizar crença usando StateManager existente
   */
  async updateBelief(update: BeliefUpdate): Promise<void> {
    const oldBelief = await this.getBelief(update.key);
    
    const newBelief: Belief = {
      key: update.key,
      value: update.value,
      confidence: update.confidence || 1.0,
      source: update.source,
      timestamp: Date.now()
    };
    
    // Usar StateManager existente
    await this.stateManager.set(this.namespace, `belief:${update.key}`, newBelief);
    
    // Emitir evento usando sistema existente
    if (this.eventEmitter) {
      this.eventEmitter(beliefChangeEvent.with({
        belief: update.key,
        oldValue: oldBelief?.value,
        newValue: update.value,
        timestamp: Date.now()
      }));
    }
  }
  
  async getBelief(key: string): Promise<Belief | undefined> {
    return await this.stateManager.get(this.namespace, `belief:${key}`);
  }
  
  async getAllBeliefs(): Promise<Belief[]> {
    // Implementar usando StateManager patterns existentes
    const beliefs: Belief[] = [];
    // Iterar sobre beliefs no namespace
    return beliefs;
  }
  
  /**
   * Belief revision usando minimal change principle
   */
  async reviseBeliefs(newBeliefs: BeliefUpdate[]): Promise<void> {
    for (const update of newBeliefs) {
      await this.updateBelief(update);
    }
  }
}

// ===== DESIRE SYSTEM =====

export interface Desire {
  id: string;
  goal: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  target: Record<string, { operator: string; value: unknown }>;
  deadline?: number;
  achieved: boolean;
  createdAt: number;
}

export class DesireSystem {
  constructor(
    private stateManager: StateManager,
    private namespace: string
  ) {}
  
  async addDesire(desire: Omit<Desire, 'id' | 'achieved' | 'createdAt'>): Promise<string> {
    const id = `desire_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const fullDesire: Desire = {
      ...desire,
      id,
      achieved: false,
      createdAt: Date.now()
    };
    
    await this.stateManager.set(this.namespace, `desire:${id}`, fullDesire);
    return id;
  }
  
  async getActiveDesires(): Promise<Desire[]> {
    // Implementar usando StateManager
    return [];
  }
  
  async achieveDesire(id: string): Promise<void> {
    const desire = await this.stateManager.get<Desire>(this.namespace, `desire:${id}`);
    if (desire) {
      desire.achieved = true;
      await this.stateManager.set(this.namespace, `desire:${id}`, desire);
    }
  }
  
  /**
   * Verificar se desires estão satisfeitos baseado em beliefs
   */
  async evaluateDesires(beliefs: BeliefSystem): Promise<{ satisfied: string[]; unsatisfied: string[] }> {
    const desires = await this.getActiveDesires();
    const satisfied: string[] = [];
    const unsatisfied: string[] = [];
    
    for (const desire of desires) {
      const isSatisfied = await this.checkDesireSatisfaction(desire, beliefs);
      if (isSatisfied) {
        satisfied.push(desire.id);
      } else {
        unsatisfied.push(desire.id);
      }
    }
    
    return { satisfied, unsatisfied };
  }
  
  private async checkDesireSatisfaction(desire: Desire, beliefs: BeliefSystem): Promise<boolean> {
    for (const [key, condition] of Object.entries(desire.target)) {
      const belief = await beliefs.getBelief(key);
      if (!belief || !this.evaluateCondition(belief.value, condition)) {
        return false;
      }
    }
    return true;
  }
  
  private evaluateCondition(value: unknown, condition: { operator: string; value: unknown }): boolean {
    switch (condition.operator) {
      case '<': return Number(value) < Number(condition.value);
      case '>': return Number(value) > Number(condition.value);
      case '===': return value === condition.value;
      case '!==': return value !== condition.value;
      default: return false;
    }
  }
}

// ===== INTENTION SYSTEM =====

export interface Intention {
  id: string;
  planName: string;
  goal: string;
  status: 'committed' | 'executing' | 'suspended' | 'achieved' | 'failed';
  priority: number;
  createdAt: number;
  context: Record<string, unknown>;
}

export class IntentionSystem {
  constructor(
    private stateManager: StateManager,
    private namespace: string
  ) {}
  
  async formIntention(planName: string, goal: string, priority: number): Promise<string> {
    const id = `intention_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const intention: Intention = {
      id,
      planName,
      goal,
      status: 'committed',
      priority,
      createdAt: Date.now(),
      context: {}
    };
    
    await this.stateManager.set(this.namespace, `intention:${id}`, intention);
    return id;
  }
  
  async getActiveIntentions(): Promise<Intention[]> {
    // Implementar usando StateManager
    return [];
  }
  
  async updateIntentionStatus(id: string, status: Intention['status']): Promise<void> {
    const intention = await this.stateManager.get<Intention>(this.namespace, `intention:${id}`);
    if (intention) {
      intention.status = status;
      await this.stateManager.set(this.namespace, `intention:${id}`, intention);
    }
  }
}

// ===== PLAN LIBRARY =====

export interface PlanAction {
  type: 'tool_call' | 'belief_update' | 'sub_goal' | 'wait';
  toolName?: string;
  input?: unknown;
  belief?: { key: string; value: unknown };
  subGoal?: string;
  duration?: number;
}

export interface Plan {
  name: string;
  description: string;
  trigger: {
    goal?: string;
    belief?: Record<string, { operator: string; value: unknown }>;
    event?: string;
  };
  preconditions: string[]; // Conditions that must be true
  actions: PlanAction[];
  effects: string[]; // Expected changes after execution
  success_conditions?: string[];
  failure_conditions?: string[];
}

export class PlanLibrary {
  private plans: Map<string, Plan> = new Map();
  
  addPlan(plan: Plan): void {
    this.plans.set(plan.name, plan);
  }
  
  getPlan(name: string): Plan | undefined {
    return this.plans.get(name);
  }
  
  /**
   * Selecionar planos aplicáveis baseado em goals e beliefs
   */
  async selectApplicablePlans(
    goals: string[],
    beliefs: BeliefSystem
  ): Promise<Plan[]> {
    const applicable: Plan[] = [];
    
    for (const plan of this.plans.values()) {
      if (await this.isPlanApplicable(plan, goals, beliefs)) {
        applicable.push(plan);
      }
    }
    
    return applicable;
  }
  
  private async isPlanApplicable(
    plan: Plan,
    goals: string[],
    beliefs: BeliefSystem
  ): Promise<boolean> {
    // Check if plan addresses any of our goals
    if (plan.trigger.goal && !goals.includes(plan.trigger.goal)) {
      return false;
    }
    
    // Check if belief conditions are met
    if (plan.trigger.belief) {
      for (const [key, condition] of Object.entries(plan.trigger.belief)) {
        const belief = await beliefs.getBelief(key);
        if (!belief || !this.evaluateCondition(belief.value, condition)) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  private evaluateCondition(value: unknown, condition: { operator: string; value: unknown }): boolean {
    // Same logic as DesireSystem
    switch (condition.operator) {
      case '<': return Number(value) < Number(condition.value);
      case '>': return Number(value) > Number(condition.value);
      case '===': return value === condition.value;
      case '!==': return value !== condition.value;
      default: return false;
    }
  }
}

// ===== BDI AGENT ENGINE =====

export interface BDIAgentDefinition {
  name: string;
  description: string;
  beliefs: {
    initial: Record<string, unknown>;
  };
  desires: Array<{
    goal: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    target: Record<string, { operator: string; value: unknown }>;
    deadline?: number;
  }>;
  plans: Plan[];
  reasoning: {
    planSelection: 'utility-based' | 'priority-based' | 'first-applicable';
    beliefRevision: 'minimal-change' | 'coherence-based';
    commitmentStrategy: 'single-minded' | 'open-minded';
  };
}

export class BDIAgentEngine {
  private beliefSystem: BeliefSystem;
  private desireSystem: DesireSystem;
  private intentionSystem: IntentionSystem;
  private planLibrary: PlanLibrary;
  
  constructor(
    private definition: BDIAgentDefinition,
    private stateManager: StateManager,
    private namespace: string
  ) {
    this.beliefSystem = new BeliefSystem(stateManager, namespace);
    this.desireSystem = new DesireSystem(stateManager, namespace);
    this.intentionSystem = new IntentionSystem(stateManager, namespace);
    this.planLibrary = new PlanLibrary();
    
    this.initialize();
  }
  
  private async initialize(): Promise<void> {
    // Initialize beliefs
    for (const [key, value] of Object.entries(this.definition.beliefs.initial)) {
      await this.beliefSystem.updateBelief({
        key,
        value,
        source: 'initial',
        confidence: 1.0
      });
    }
    
    // Initialize desires
    for (const desire of this.definition.desires) {
      await this.desireSystem.addDesire(desire);
    }
    
    // Load plans
    for (const plan of this.definition.plans) {
      this.planLibrary.addPlan(plan);
    }
  }
  
  /**
   * BDI Deliberation Cycle
   */
  async deliberate(): Promise<{ intention?: string; actions: PlanAction[] }> {
    // 1. Belief Revision (if needed)
    await this.reviseBeliefs();
    
    // 2. Option Generation (find applicable plans)
    const desires = await this.desireSystem.getActiveDesires();
    const goals = desires.map(d => d.goal);
    const applicablePlans = await this.planLibrary.selectApplicablePlans(goals, this.beliefSystem);
    
    // 3. Filtering (check preconditions)
    const viablePlans = await this.filterViablePlans(applicablePlans);
    
    // 4. Intention Formation (select best plan)
    const selectedPlan = this.selectBestPlan(viablePlans);
    
    if (selectedPlan) {
      const intentionId = await this.intentionSystem.formIntention(
        selectedPlan.name,
        goals[0], // Simplified: use first goal
        this.getPlanPriority(selectedPlan)
      );
      
      return {
        intention: intentionId,
        actions: selectedPlan.actions
      };
    }
    
    return { actions: [] };
  }
  
  private async reviseBeliefs(): Promise<void> {
    // Implement belief revision based on strategy
    // For now, just basic implementation
  }
  
  private async filterViablePlans(plans: Plan[]): Promise<Plan[]> {
    // Check preconditions for each plan
    const viable: Plan[] = [];
    
    for (const plan of plans) {
      if (await this.checkPreconditions(plan)) {
        viable.push(plan);
      }
    }
    
    return viable;
  }
  
  private async checkPreconditions(plan: Plan): Promise<boolean> {
    // Simplified precondition checking
    return true;
  }
  
  private selectBestPlan(plans: Plan[]): Plan | undefined {
    if (plans.length === 0) return undefined;
    
    switch (this.definition.reasoning.planSelection) {
      case 'first-applicable':
        return plans[0];
      case 'priority-based':
        // Implement priority-based selection
        return plans[0];
      case 'utility-based':
        // Implement utility-based selection
        return plans[0];
      default:
        return plans[0];
    }
  }
  
  private getPlanPriority(plan: Plan): number {
    // Derive priority from plan characteristics
    return 1;
  }
  
  // Public API for accessing BDI components
  getBeliefs(): BeliefSystem { return this.beliefSystem; }
  getDesires(): DesireSystem { return this.desireSystem; }
  getIntentions(): IntentionSystem { return this.intentionSystem; }
  getPlans(): PlanLibrary { return this.planLibrary; }
}

/**
 * Factory function para criar BDI agents
 * Integra com AgentDefinition existente
 */
export function defineBDIAgent(definition: BDIAgentDefinition): AgentDefinition {
  return {
    name: definition.name,
    description: definition.description,
    
    async think(input: unknown, context: AgentContext) {
      // Create BDI engine using existing StateManager
      const bdiEngine = new BDIAgentEngine(
        definition,
        context.stateManager as any, // Type assertion for now
        `bdi:${context.executionId}`
      );
      
      // Run deliberation cycle
      const deliberationResult = await bdiEngine.deliberate();
      
      if (deliberationResult.actions.length > 0) {
        const firstAction = deliberationResult.actions[0];
        
        switch (firstAction.type) {
          case 'tool_call':
            return {
              reasoning: `BDI deliberation selected plan with ${deliberationResult.actions.length} actions. Executing tool call: ${firstAction.toolName}`,
              action: {
                type: 'tool_call',
                toolName: firstAction.toolName!,
                input: firstAction.input
              }
            };
          
          case 'belief_update':
            // Update belief and continue
            await bdiEngine.getBeliefs().updateBelief({
              key: firstAction.belief!.key,
              value: firstAction.belief!.value,
              source: 'plan_execution'
            });
            
            return {
              reasoning: `Updated belief ${firstAction.belief!.key}, re-evaluating plans`,
              action: {
                type: 'final_answer',
                content: `Belief updated: ${firstAction.belief!.key} = ${firstAction.belief!.value}`
              }
            };
          
          default:
            return {
              reasoning: 'BDI deliberation complete, no immediate action needed',
              action: {
                type: 'final_answer',
                content: 'BDI cycle completed'
              }
            };
        }
      }
      
      return {
        reasoning: 'No applicable plans found in current context',
        action: {
          type: 'need_more_info',
          question: 'Please provide more context or wait for environment changes'
        }
      };
    }
  };
}

// Events for BDI system
export const beliefChangeEvent = workflowEvent<{
  belief: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
}>('bdi.belief.changed');

export const intentionFormedEvent = workflowEvent<{
  intentionId: string;
  planName: string;
  goal: string;
  timestamp: number;
}>('bdi.intention.formed');

export const planExecutedEvent = workflowEvent<{
  planName: string;
  success: boolean;
  effects: string[];
  timestamp: number;
}>('bdi.plan.executed');
```

### **API de Uso**
```typescript
// Criar agente BDI
const optimizerAgent = defineBDIAgent({
  name: 'cost-optimizer',
  description: 'Autonomous agent that optimizes system costs while maintaining performance',
  
  beliefs: {
    initial: {
      'system.cpu_usage': 0.7,
      'system.cost_per_hour': 50,
      'performance.response_time': 200
    }
  },
  
  desires: [
    {
      goal: 'minimize_costs',
      priority: 'high',
      target: {
        'system.cost_per_hour': { operator: '<', value: 40 }
      }
    }
  ],
  
  plans: [
    {
      name: 'scale_down_resources',
      trigger: { goal: 'minimize_costs' },
      preconditions: ['system.cpu_usage < 0.5'],
      actions: [
        {
          type: 'tool_call',
          toolName: 'infrastructure-scaler',
          input: { action: 'scale_down', percentage: 0.2 }
        }
      ],
      effects: ['system.cost_per_hour -= 10']
    }
  ],
  
  reasoning: {
    planSelection: 'utility-based',
    beliefRevision: 'minimal-change',
    commitmentStrategy: 'single-minded'
  }
});

// Usar em orchestration
const orchestration = createOrchestration({
  debug: true
});

orchestration.createAgent(optimizerAgent);

const result = await orchestration.callAgent('OptimizerAgent', 'optimize system costs');
```

---

## 🧩 Feature 2: Advanced Memory Systems

### **Objetivo**
Implementar sistemas de memória sofisticados (episódica, semântica, working, procedural) que permitem aos agentes aprender com experiências, manter contexto e melhorar performance ao longo do tempo.

### **Casos de Uso**
```typescript
// Agente com memória episódica que lembra experiências
const learningAgent = defineAgent({
  name: 'learning-support-agent',
  
  memory: {
    episodic: new EpisodicMemory({
      maxEpisodes: 1000,
      retention: '30-days',
      indexing: ['user-id', 'issue-type', 'outcome']
    }),
    
    semantic: new SemanticMemory({
      domains: ['customer-service', 'technical-support'],
      updateStrategy: 'incremental',
      confidence_threshold: 0.8
    }),
    
    working: new WorkingMemory({
      capacity: 7, // Miller's 7±2 rule
      decay: 'exponential',
      refresh_on_access: true
    }),
    
    procedural: new ProceduralMemory({
      skills: ['ticket-resolution', 'escalation-handling'],
      learning_rate: 0.1,
      expertise_tracking: true
    })
  },
  
  think: async (input, context) => {
    // Usar memórias para tomar decisões mais inteligentes
    const similarCases = await context.memory.episodic.recall({
      query: input,
      similarity_threshold: 0.7,
      limit: 3
    });
    
    const relevantKnowledge = await context.memory.semantic.query({
      topic: extractTopic(input),
      confidence_min: 0.6
    });
    
    return {
      reasoning: `Found ${similarCases.length} similar cases and ${relevantKnowledge.length} relevant knowledge items`,
      action: {
        type: 'tool_call',
        toolName: 'support-responder',
        input: {
          query: input,
          context: { similarCases, relevantKnowledge }
        }
      }
    };
  }
});
```

### **Arquitetura Existente que Vamos Usar**

#### **1. Memory Types Foundation (`src/core/types/memory-types.ts`)**
```typescript
// ✅ JÁ EXISTE - Base para implementar tipos específicos de memória
export interface MemoryEntry {
  id: string;
  content: unknown;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface MemoryQuery {
  // ✅ VAMOS ESTENDER para diferentes tipos de memória
}
```

#### **2. State Manager (`src/utils/thread-safe-state.ts`)**
```typescript
// ✅ JÁ EXISTE - Para persistir memórias
export interface StateManager {
  get<T>(namespace: string, key: string): Promise<T | undefined>;
  set<T>(namespace: string, key: string, value: T): Promise<void>;
  // ✅ PERFEITO para diferentes tipos de memória
}
```

### **O que Criar**

#### **1. Memory Systems (`src/memory/index.ts`)**
```typescript
/**
 * Advanced Memory Systems for Agents
 * Implements episodic, semantic, working, and procedural memory
 */

import type { StateManager } from '../utils/thread-safe-state.js';
import { createLogger } from '../observability/index.js';

// ===== BASE MEMORY INTERFACE =====

export interface MemoryEntry {
  id: string;
  content: unknown;
  timestamp: number;
  metadata: Record<string, unknown>;
  confidence?: number;
  tags?: string[];
}

export interface MemoryQuery {
  query?: unknown;
  filters?: Record<string, unknown>;
  similarity_threshold?: number;
  confidence_min?: number;
  limit?: number;
  sort_by?: 'timestamp' | 'confidence' | 'relevance';
}

export interface MemorySearchResult {
  entries: MemoryEntry[];
  total: number;
  query_time: number;
}

export abstract class BaseMemory {
  protected logger = createLogger(`memory:${this.constructor.name}`);
  
  constructor(
    protected stateManager: StateManager,
    protected namespace: string,
    protected config: Record<string, unknown> = {}
  ) {}
  
  abstract store(content: unknown, metadata?: Record<string, unknown>): Promise<string>;
  abstract recall(query: MemoryQuery): Promise<MemorySearchResult>;
  abstract forget(entryId: string): Promise<boolean>;
  abstract consolidate(): Promise<void>;
}

// ===== EPISODIC MEMORY =====

export interface EpisodicEntry extends MemoryEntry {
  episode: {
    context: unknown;
    actions: unknown[];
    outcome: unknown;
    duration: number;
    success: boolean;
  };
  emotional_valence?: number; // -1 to 1
  importance?: number; // 0 to 1
}

export interface EpisodicMemoryConfig {
  maxEpisodes: number;
  retention: string; // '30-days', '1-year', etc.
  indexing: string[]; // Fields to index for fast retrieval
  consolidation_interval: number; // milliseconds
  importance_threshold: number; // 0-1, below this episodes may be forgotten
}

export class EpisodicMemory extends BaseMemory {
  private config: EpisodicMemoryConfig;
  
  constructor(
    stateManager: StateManager,
    namespace: string,
    config: Partial<EpisodicMemoryConfig> = {}
  ) {
    super(stateManager, namespace, config);
    
    this.config = {
      maxEpisodes: config.maxEpisodes || 1000,
      retention: config.retention || '30-days',
      indexing: config.indexing || ['timestamp', 'outcome'],
      consolidation_interval: config.consolidation_interval || 24 * 60 * 60 * 1000, // 24h
      importance_threshold: config.importance_threshold || 0.1,
      ...config
    };
  }
  
  /**
   * Store episodic experience
   */
  async store(
    episode: {
      context: unknown;
      actions: unknown[];
      outcome: unknown;
      duration: number;
      success: boolean;
    },
    metadata: Record<string, unknown> = {}
  ): Promise<string> {
    const id = `episode_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    const entry: EpisodicEntry = {
      id,
      content: episode,
      timestamp: Date.now(),
      metadata,
      episode,
      importance: this.calculateImportance(episode),
      emotional_valence: episode.success ? 0.5 : -0.5
    };
    
    await this.stateManager.set(this.namespace, `episode:${id}`, entry);
    
    // Update indices for fast retrieval
    await this.updateIndices(entry);
    
    // Check if we need to forget old episodes
    await this.enforceRetentionPolicy();
    
    this.logger.debug('Stored episodic memory', {
      id,
      importance: entry.importance,
      success: episode.success
    });
    
    return id;
  }
  
  /**
   * Recall similar episodes
   */
  async recall(query: MemoryQuery): Promise<MemorySearchResult> {
    const startTime = Date.now();
    
    // Get all episodes (in production, this would be optimized with proper indexing)
    const allEpisodes = await this.getAllEpisodes();
    
    let filteredEpisodes = allEpisodes;
    
    // Apply filters
    if (query.filters) {
      filteredEpisodes = this.applyFilters(filteredEpisodes, query.filters);
    }
    
    // Apply similarity search if query provided
    if (query.query) {
      filteredEpisodes = this.calculateSimilarity(filteredEpisodes, query.query);
      
      if (query.similarity_threshold) {
        filteredEpisodes = filteredEpisodes.filter(e => 
          (e.metadata.similarity as number) >= query.similarity_threshold!
        );
      }
    }
    
    // Sort results
    const sortBy = query.sort_by || 'relevance';
    filteredEpisodes = this.sortEpisodes(filteredEpisodes, sortBy);
    
    // Apply limit
    if (query.limit) {
      filteredEpisodes = filteredEpisodes.slice(0, query.limit);
    }
    
    const queryTime = Date.now() - startTime;
    
    this.logger.debug('Episodic recall completed', {
      totalEpisodes: allEpisodes.length,
      filteredEpisodes: filteredEpisodes.length,
      queryTime
    });
    
    return {
      entries: filteredEpisodes,
      total: filteredEpisodes.length,
      query_time: queryTime
    };
  }
  
  async forget(entryId: string): Promise<boolean> {
    try {
      await this.stateManager.delete(this.namespace, `episode:${entryId}`);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Consolidate memories - strengthen important ones, forget unimportant ones
   */
  async consolidate(): Promise<void> {
    const allEpisodes = await this.getAllEpisodes();
    let forgottenCount = 0;
    let strengthenedCount = 0;
    
    for (const episode of allEpisodes) {
      // Forget low-importance episodes
      if (episode.importance !== undefined && episode.importance < this.config.importance_threshold) {
        await this.forget(episode.id);
        forgottenCount++;
      } else {
        // Strengthen important episodes by updating their importance
        if (episode.importance !== undefined && episode.importance > 0.8) {
          episode.importance = Math.min(1.0, episode.importance * 1.1);
          await this.stateManager.set(this.namespace, `episode:${episode.id}`, episode);
          strengthenedCount++;
        }
      }
    }
    
    this.logger.info('Memory consolidation completed', {
      forgottenCount,
      strengthenedCount,
      totalEpisodes: allEpisodes.length
    });
  }
  
  // Private helper methods
  
  private calculateImportance(episode: {
    context: unknown;
    actions: unknown[];
    outcome: unknown;
    duration: number;
    success: boolean;
  }): number {
    let importance = 0.5; // Base importance
    
    // Successful episodes are more important
    if (episode.success) importance += 0.3;
    
    // Longer episodes might be more complex/important
    if (episode.duration > 60000) importance += 0.1; // > 1 minute
    
    // More actions might indicate complexity
    if (episode.actions.length > 3) importance += 0.1;
    
    return Math.min(1.0, importance);
  }
  
  private async getAllEpisodes(): Promise<EpisodicEntry[]> {
    // In production, this would use proper indexing
    // For now, simplified implementation
    return [];
  }
  
  private applyFilters(episodes: EpisodicEntry[], filters: Record<string, unknown>): EpisodicEntry[] {
    return episodes.filter(episode => {
      for (const [key, value] of Object.entries(filters)) {
        const episodeValue = this.getNestedValue(episode, key);
        if (episodeValue !== value) {
          return false;
        }
      }
      return true;
    });
  }
  
  private calculateSimilarity(episodes: EpisodicEntry[], query: unknown): EpisodicEntry[] {
    // Simplified similarity calculation
    // In production, would use proper vector embeddings
    return episodes.map(episode => ({
      ...episode,
      metadata: {
        ...episode.metadata,
        similarity: Math.random() // Placeholder
      }
    }));
  }
  
  private sortEpisodes(episodes: EpisodicEntry[], sortBy: string): EpisodicEntry[] {
    switch (sortBy) {
      case 'timestamp':
        return episodes.sort((a, b) => b.timestamp - a.timestamp);
      case 'confidence':
        return episodes.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      case 'relevance':
        return episodes.sort((a, b) => 
          (b.metadata.similarity as number || 0) - (a.metadata.similarity as number || 0)
        );
      default:
        return episodes;
    }
  }
  
  private getNestedValue(obj: any, path: string): unknown {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  private async updateIndices(entry: EpisodicEntry): Promise<void> {
    // Update search indices for fast retrieval
    // Implementation would depend on chosen indexing strategy
  }
  
  private async enforceRetentionPolicy(): Promise<void> {
    const allEpisodes = await this.getAllEpisodes();
    
    if (allEpisodes.length > this.config.maxEpisodes) {
      // Remove oldest, least important episodes
      const toRemove = allEpisodes
        .sort((a, b) => (a.importance || 0) - (b.importance || 0))
        .slice(0, allEpisodes.length - this.config.maxEpisodes);
      
      for (const episode of toRemove) {
        await this.forget(episode.id);
      }
    }
  }
}

// ===== SEMANTIC MEMORY =====

export interface SemanticEntry extends MemoryEntry {
  concept: string;
  relations: Array<{
    type: 'is-a' | 'part-of' | 'related-to' | 'causes' | 'enables';
    target: string;
    strength: number; // 0-1
  }>;
  facts: Array<{
    predicate: string;
    object: unknown;
    confidence: number;
  }>;
}

export interface SemanticMemoryConfig {
  domains: string[];
  updateStrategy: 'replace' | 'merge' | 'incremental';
  confidence_threshold: number;
  max_relations_per_concept: number;
  consolidation_strategy: 'strengthen' | 'prune' | 'both';
}

export class SemanticMemory extends BaseMemory {
  private config: SemanticMemoryConfig;
  
  constructor(
    stateManager: StateManager,
    namespace: string,
    config: Partial<SemanticMemoryConfig> = {}
  ) {
    super(stateManager, namespace, config);
    
    this.config = {
      domains: config.domains || ['general'],
      updateStrategy: config.updateStrategy || 'incremental',
      confidence_threshold: config.confidence_threshold || 0.7,
      max_relations_per_concept: config.max_relations_per_concept || 10,
      consolidation_strategy: config.consolidation_strategy || 'both',
      ...config
    };
  }
  
  async store(
    knowledge: {
      concept: string;
      facts: Array<{ predicate: string; object: unknown; confidence: number }>;
      relations?: Array<{ type: string; target: string; strength: number }>;
    },
    metadata: Record<string, unknown> = {}
  ): Promise<string> {
    const id = `semantic_${knowledge.concept}_${Date.now()}`;
    
    const entry: SemanticEntry = {
      id,
      content: knowledge,
      timestamp: Date.now(),
      metadata,
      concept: knowledge.concept,
      relations: knowledge.relations || [],
      facts: knowledge.facts
    };
    
    // Check if concept already exists
    const existing = await this.getConcept(knowledge.concept);
    
    if (existing) {
      // Merge with existing knowledge
      const merged = await this.mergeKnowledge(existing, entry);
      await this.stateManager.set(this.namespace, `concept:${knowledge.concept}`, merged);
    } else {
      await this.stateManager.set(this.namespace, `concept:${knowledge.concept}`, entry);
    }
    
    this.logger.debug('Stored semantic knowledge', {
      concept: knowledge.concept,
      factsCount: knowledge.facts.length,
      relationsCount: knowledge.relations?.length || 0
    });
    
    return id;
  }
  
  async recall(query: MemoryQuery): Promise<MemorySearchResult> {
    const startTime = Date.now();
    
    // Implementation for semantic search
    // Would include concept matching, relation traversal, etc.
    
    return {
      entries: [],
      total: 0,
      query_time: Date.now() - startTime
    };
  }
  
  async forget(entryId: string): Promise<boolean> {
    // Implementation for forgetting semantic knowledge
    return true;
  }
  
  async consolidate(): Promise<void> {
    // Strengthen frequently accessed concepts
    // Prune weak relations
    // Merge similar concepts
  }
  
  private async getConcept(concept: string): Promise<SemanticEntry | undefined> {
    return await this.stateManager.get(this.namespace, `concept:${concept}`);
  }
  
  private async mergeKnowledge(existing: SemanticEntry, new_entry: SemanticEntry): Promise<SemanticEntry> {
    // Implement knowledge merging strategy
    return existing;
  }
}

// ===== WORKING MEMORY =====

export interface WorkingMemoryEntry {
  id: string;
  content: unknown;
  activation: number; // 0-1, how "active" this item is
  last_accessed: number;
  access_count: number;
  decay_rate: number;
}

export interface WorkingMemoryConfig {
  capacity: number; // Usually 7±2 items
  decay: 'linear' | 'exponential';
  refresh_on_access: boolean;
  activation_threshold: number;
}

export class WorkingMemory {
  private items: Map<string, WorkingMemoryEntry> = new Map();
  private config: WorkingMemoryConfig;
  private logger = createLogger('memory:working');
  
  constructor(config: Partial<WorkingMemoryConfig> = {}) {
    this.config = {
      capacity: config.capacity || 7,
      decay: config.decay || 'exponential',
      refresh_on_access: config.refresh_on_access !== false,
      activation_threshold: config.activation_threshold || 0.1,
      ...config
    };
    
    // Start decay process
    this.startDecayProcess();
  }
  
  store(content: unknown, activation: number = 1.0): string {
    const id = `wm_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    const entry: WorkingMemoryEntry = {
      id,
      content,
      activation,
      last_accessed: Date.now(),
      access_count: 1,
      decay_rate: 0.1
    };
    
    this.items.set(id, entry);
    
    // If over capacity, remove least active items
    this.enforceCapacity();
    
    this.logger.debug('Stored in working memory', {
      id,
      activation,
      totalItems: this.items.size
    });
    
    return id;
  }
  
  retrieve(id: string): unknown | undefined {
    const entry = this.items.get(id);
    
    if (!entry) return undefined;
    
    // Update activation on access
    if (this.config.refresh_on_access) {
      entry.activation = Math.min(1.0, entry.activation + 0.2);
      entry.last_accessed = Date.now();
      entry.access_count++;
    }
    
    return entry.content;
  }
  
  getActiveItems(): WorkingMemoryEntry[] {
    return Array.from(this.items.values())
      .filter(item => item.activation >= this.config.activation_threshold)
      .sort((a, b) => b.activation - a.activation);
  }
  
  clear(): void {
    this.items.clear();
  }
  
  private enforceCapacity(): void {
    if (this.items.size <= this.config.capacity) return;
    
    // Remove least active items
    const sorted = Array.from(this.items.values())
      .sort((a, b) => a.activation - b.activation);
    
    const toRemove = sorted.slice(0, this.items.size - this.config.capacity);
    
    for (const item of toRemove) {
      this.items.delete(item.id);
    }
  }
  
  private startDecayProcess(): void {
    setInterval(() => {
      this.applyDecay();
    }, 1000); // Decay every second
  }
  
  private applyDecay(): void {
    const now = Date.now();
    const toRemove: string[] = [];
    
    for (const [id, entry] of this.items) {
      const timeSinceAccess = now - entry.last_accessed;
      const decayAmount = this.calculateDecay(timeSinceAccess, entry.decay_rate);
      
      entry.activation = Math.max(0, entry.activation - decayAmount);
      
      // Remove items below activation threshold
      if (entry.activation < this.config.activation_threshold) {
        toRemove.push(id);
      }
    }
    
    for (const id of toRemove) {
      this.items.delete(id);
    }
  }
  
  private calculateDecay(timeSinceAccess: number, decayRate: number): number {
    const secondsSinceAccess = timeSinceAccess / 1000;
    
    switch (this.config.decay) {
      case 'linear':
        return decayRate * secondsSinceAccess;
      case 'exponential':
        return decayRate * Math.exp(secondsSinceAccess / 60); // Exponential over minutes
      default:
        return decayRate * secondsSinceAccess;
    }
  }
}

// ===== PROCEDURAL MEMORY =====

export interface Skill {
  name: string;
  expertise_level: number; // 0-1
  success_count: number;
  failure_count: number;
  last_used: number;
  procedures: Array<{
    name: string;
    steps: unknown[];
    success_rate: number;
    average_duration: number;
  }>;
}

export interface ProceduralMemoryConfig {
  skills: string[];
  learning_rate: number;
  expertise_tracking: boolean;
  skill_decay_rate: number;
}

export class ProceduralMemory extends BaseMemory {
  private skills: Map<string, Skill> = new Map();
  private config: ProceduralMemoryConfig;
  
  constructor(
    stateManager: StateManager,
    namespace: string,
    config: Partial<ProceduralMemoryConfig> = {}
  ) {
    super(stateManager, namespace, config);
    
    this.config = {
      skills: config.skills || [],
      learning_rate: config.learning_rate || 0.1,
      expertise_tracking: config.expertise_tracking !== false,
      skill_decay_rate: config.skill_decay_rate || 0.001,
      ...config
    };
    
    this.initializeSkills();
  }
  
  async store(
    skillExecution: {
      skill: string;
      procedure: string;
      steps: unknown[];
      success: boolean;
      duration: number;
    },
    metadata: Record<string, unknown> = {}
  ): Promise<string> {
    const skill = this.skills.get(skillExecution.skill);
    
    if (!skill) {
      throw new Error(`Skill ${skillExecution.skill} not found`);
    }
    
    // Update skill statistics
    if (skillExecution.success) {
      skill.success_count++;
    } else {
      skill.failure_count++;
    }
    
    skill.last_used = Date.now();
    
    // Update expertise level based on performance
    if (this.config.expertise_tracking) {
      this.updateExpertise(skill, skillExecution.success);
    }
    
    // Update procedure if it exists
    let procedure = skill.procedures.find(p => p.name === skillExecution.procedure);
    
    if (procedure) {
      // Update existing procedure
      procedure.success_rate = this.calculateNewSuccessRate(
        procedure.success_rate,
        skillExecution.success
      );
      procedure.average_duration = this.calculateNewAverageDuration(
        procedure.average_duration,
        skillExecution.duration
      );
    } else {
      // Add new procedure
      procedure = {
        name: skillExecution.procedure,
        steps: skillExecution.steps,
        success_rate: skillExecution.success ? 1.0 : 0.0,
        average_duration: skillExecution.duration
      };
      skill.procedures.push(procedure);
    }
    
    // Persist to state manager
    await this.stateManager.set(this.namespace, `skill:${skillExecution.skill}`, skill);
    
    const id = `proc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    this.logger.debug('Updated procedural memory', {
      skill: skillExecution.skill,
      procedure: skillExecution.procedure,
      success: skillExecution.success,
      expertise_level: skill.expertise_level
    });
    
    return id;
  }
  
  async recall(query: MemoryQuery): Promise<MemorySearchResult> {
    const startTime = Date.now();
    const results: MemoryEntry[] = [];
    
    if (query.filters?.skill) {
      const skill = this.skills.get(query.filters.skill as string);
      if (skill) {
        results.push({
          id: `skill_${skill.name}`,
          content: skill,
          timestamp: skill.last_used,
          metadata: { type: 'skill' }
        });
      }
    } else {
      // Return all skills
      for (const skill of this.skills.values()) {
        results.push({
          id: `skill_${skill.name}`,
          content: skill,
          timestamp: skill.last_used,
          metadata: { type: 'skill' }
        });
      }
    }
    
    return {
      entries: results,
      total: results.length,
      query_time: Date.now() - startTime
    };
  }
  
  async forget(entryId: string): Promise<boolean> {
    // Implementation for forgetting skills/procedures
    return true;
  }
  
  async consolidate(): Promise<void> {
    // Apply skill decay
    // Strengthen frequently used skills
    // Remove rarely used procedures
  }
  
  getSkillExpertise(skillName: string): number {
    const skill = this.skills.get(skillName);
    return skill ? skill.expertise_level : 0;
  }
  
  getBestProcedure(skillName: string): { name: string; steps: unknown[] } | undefined {
    const skill = this.skills.get(skillName);
    if (!skill || skill.procedures.length === 0) return undefined;
    
    // Return procedure with highest success rate
    const best = skill.procedures.reduce((best, current) => 
      current.success_rate > best.success_rate ? current : best
    );
    
    return {
      name: best.name,
      steps: best.steps
    };
  }
  
  private initializeSkills(): void {
    for (const skillName of this.config.skills) {
      this.skills.set(skillName, {
        name: skillName,
        expertise_level: 0.0,
        success_count: 0,
        failure_count: 0,
        last_used: Date.now(),
        procedures: []
      });
    }
  }
  
  private updateExpertise(skill: Skill, success: boolean): void {
    const total_attempts = skill.success_count + skill.failure_count;
    const current_success_rate = skill.success_count / total_attempts;
    
    // Learning curve: expertise increases with practice and success
    const practice_factor = Math.min(1.0, total_attempts / 100); // Normalize over 100 attempts
    const success_factor = current_success_rate;
    
    skill.expertise_level = practice_factor * success_factor;
  }
  
  private calculateNewSuccessRate(currentRate: number, newSuccess: boolean): number {
    // Exponential moving average
    const alpha = this.config.learning_rate;
    const newValue = newSuccess ? 1.0 : 0.0;
    return (1 - alpha) * currentRate + alpha * newValue;
  }
  
  private calculateNewAverageDuration(currentAvg: number, newDuration: number): number {
    // Exponential moving average
    const alpha = this.config.learning_rate;
    return (1 - alpha) * currentAvg + alpha * newDuration;
  }
}

// ===== MEMORY INTEGRATION =====

export interface AgentMemorySystem {
  episodic: EpisodicMemory;
  semantic: SemanticMemory;
  working: WorkingMemory;
  procedural: ProceduralMemory;
}

export function createAgentMemorySystem(
  stateManager: StateManager,
  agentId: string,
  config: {
    episodic?: Partial<EpisodicMemoryConfig>;
    semantic?: Partial<SemanticMemoryConfig>;
    working?: Partial<WorkingMemoryConfig>;
    procedural?: Partial<ProceduralMemoryConfig>;
  } = {}
): AgentMemorySystem {
  const namespace = `memory:${agentId}`;
  
  return {
    episodic: new EpisodicMemory(stateManager, `${namespace}:episodic`, config.episodic),
    semantic: new SemanticMemory(stateManager, `${namespace}:semantic`, config.semantic),
    working: new WorkingMemory(config.working),
    procedural: new ProceduralMemory(stateManager, `${namespace}:procedural`, config.procedural)
  };
}
```

#### **2. Modificar Agent Context (`src/engine/improved-agent-engine.ts`)**
```typescript
// ✅ MODIFICAR - Adicionar sistema de memória ao contexto
import type { AgentMemorySystem } from '../memory/index.js';

export interface AgentContext {
  executionId: string;
  correlationId: string;
  availableTools: Array<{/* ... */}>;
  state: Map<string, unknown>;
  logger: ReturnType<typeof createLogger>;
  streamProcessor?: AgentStreamProcessor;
  // ✅ NOVO - Sistema de memória
  memory?: AgentMemorySystem;
}

export class AgentEngine {
  constructor(
    private definition: AgentDefinition,
    private toolEngine: ToolEngine,
    private collaborationManager?: AgentCollaborationManager,
    config?: Partial<BaseEngineConfig> & {
      enableStreaming?: boolean;
      memoryConfig?: {
        episodic?: Partial<EpisodicMemoryConfig>;
        semantic?: Partial<SemanticMemoryConfig>;
        working?: Partial<WorkingMemoryConfig>;
        procedural?: Partial<ProceduralMemoryConfig>;
      };
    }
  ) {
    // ... existing constructor
    this.memoryConfig = config?.memoryConfig;
  }
  
  protected async executeCore(
    input: AgentInputEvent<TInput>,
    context: EngineContext,
  ): Promise<AgentOutputEvent<TOutput>> {
    // ✅ CRIAR sistema de memória para este agente
    const memorySystem = this.memoryConfig 
      ? createAgentMemorySystem(context.stateManager, this.definition.name, this.memoryConfig)
      : undefined;
    
    const agentContext: AgentContext = {
      executionId: context.executionId,
      correlationId: context.correlationId,
      availableTools: this.toolEngine.getAvailableTools(),
      state: new AgentStateAdapter(context.stateManager, stateNamespace),
      logger: this.logger,
      streamProcessor,
      memory: memorySystem // ✅ ADICIONAR memória
    };
    
    // ... rest of existing logic
    
    // ✅ ARMAZENAR experiência na memória episódica
    if (memorySystem) {
      const episode = {
        context: input.input,
        actions: [thought.action],
        outcome: result,
        duration: Date.now() - startTime,
        success: true // Determine based on result
      };
      
      await memorySystem.episodic.store(episode, {
        agent: this.definition.name,
        executionId: context.executionId
      });
    }
    
    return result;
  }
}
```

### **API de Uso**
```typescript
// Agente com memória completa
const learningAgent = new AgentEngine(agentDef, toolEngine, undefined, {
  memoryConfig: {
    episodic: {
      maxEpisodes: 1000,
      retention: '30-days',
      indexing: ['user-id', 'outcome']
    },
    semantic: {
      domains: ['customer-service'],
      confidence_threshold: 0.8
    },
    working: {
      capacity: 7,
      decay: 'exponential'
    },
    procedural: {
      skills: ['ticket-resolution', 'escalation'],
      learning_rate: 0.1
    }
  }
});

// Usar memória no agent definition
const smartAgent = defineAgent({
  name: 'memory-enabled-agent',
  think: async (input, context) => {
    // Consultar memória episódica para casos similares
    const similarCases = await context.memory?.episodic.recall({
      query: input,
      similarity_threshold: 0.7,
      limit: 3
    });
    
    // Consultar conhecimento semântico
    const knowledge = await context.memory?.semantic.recall({
      filters: { domain: 'customer-service' },
      confidence_min: 0.6
    });
    
    // Armazenar contexto atual na working memory
    context.memory?.working.store(input, 0.9);
    
    return {
      reasoning: `Found ${similarCases?.entries.length} similar cases`,
      action: {
        type: 'tool_call',
        toolName: 'responder',
        input: { context: similarCases?.entries }
      }
    };
  }
});
```

---

## 🎯 Feature 3: Finite State Machine Support

### **Objetivo**
Implementar suporte completo a máquinas de estado finito (FSM) para permitir agentes determinísticos com comportamento previsível e workflows complexos baseados em estados.

### **Casos de Uso**
```typescript
// Agente de processamento de pedidos com estados bem definidos
const orderProcessingAgent = defineStateMachineAgent({
  name: 'order-processor',
  
  states: {
    'validating': {
      entry: async (context) => {
        context.memory.working.store('validation_start', Date.now());
        return startValidation(context.input);
      },
      
      on: {
        'validation_success': {
          target: 'processing_payment',
          actions: [
            (context, event) => logTransition('validation', 'payment', event.data)
          ]
        },
        'validation_failed': {
          target: 'error_handling',
          actions: [
            (context, event) => storeError(context, event.data.error)
          ]
        },
        'timeout': 'error_handling'
      },
      
      timeout: {
        after: 30000, // 30 seconds
        target: 'error_handling'
      }
    },
    
    'processing_payment': {
      entry: async (context) => {
        return processPayment(context.data.paymentInfo);
      },
      
      on: {
        'payment_success': 'fulfillment',
        'payment_failed': 'payment_retry',
        'fraud_detected': 'fraud_review'
      }
    },
    
    'payment_retry': {
      entry: async (context) => {
        context.state.retryCount = (context.state.retryCount || 0) + 1;
        if (context.state.retryCount >= 3) {
          return { type: 'max_retries_reached' };
        }
        return retryPayment(context.data.paymentInfo);
      },
      
      on: {
        'payment_success': 'fulfillment',
        'payment_failed': {
          target: 'payment_retry',
          guard: (context) => context.state.retryCount < 3
        },
        'max_retries_reached': 'error_handling'
      }
    },
    
    'fulfillment': {
      entry: async (context) => {
        return startFulfillment(context.data.orderDetails);
      },
      
      on: {
        'fulfillment_complete': 'completed',
        'fulfillment_failed': 'error_handling'
      }
    },
    
    'completed': {
      type: 'final',
      entry: async (context) => {
        await notifyCustomer(context.data.customerInfo);
        await updateInventory(context.data.orderDetails);
      }
    },
    
    'error_handling': {
      entry: async (context) => {
        await logError(context.error);
        await notifySupport(context.error);
      },
      
      on: {
        'retry': 'validating',
        'escalate': 'manual_review',
        'cancel': 'cancelled'
      }
    },
    
    'manual_review': {
      entry: async (context) => {
        return requestHumanReview(context);
      },
      
      on: {
        'approve': 'processing_payment',
        'reject': 'cancelled'
      }
    },
    
    'cancelled': {
      type: 'final',
      entry: async (context) => {
        await refundPayment(context.data.paymentInfo);
        await notifyCustomer(context.data.customerInfo);
      }
    }
  },
  
  initial: 'validating',
  
  context: {
    retryCount: 0,
    errors: [],
    startTime: null
  },
  
  guards: {
    canRetry: (context) => context.retryCount < 3,
    hasValidPayment: (context) => !!context.data.paymentInfo?.token,
    isHighValue: (context) => context.data.orderTotal > 1000
  },
  
  actions: {
    logTransition: (context, event) => {
      console.log(`Transitioning: ${event.type}`, context.currentState);
    },
    storeError: (context, error) => {
      context.errors.push({ error, timestamp: Date.now() });
    }
  }
});
```

### **Arquitetura Existente que Vamos Usar**

#### **1. Event System (`src/runtime/index.ts`)**
```typescript
// ✅ JÁ EXISTE - Perfeito para state transitions
const stateTransitionEvent = workflowEvent<{
  fromState: string;
  toState: string;
  trigger: string;
  timestamp: number;
}>('fsm.transition');
```

#### **2. State Management (`src/utils/thread-safe-state.ts`)**
```typescript
// ✅ JÁ EXISTE - Para persistir estado atual da FSM
export interface StateManager {
  get<T>(namespace: string, key: string): Promise<T | undefined>;
  set<T>(namespace: string, key: string, value: T): Promise<void>;
  // ✅ PERFEITO para current state e context
}
```

#### **3. Agent Context (`src/engine/improved-agent-engine.ts`)**
```typescript
// ✅ JÁ EXISTE - Vamos adicionar FSM state
export interface AgentContext {
  // ✅ VAMOS ADICIONAR
  fsm?: {
    currentState: string;
    context: Record<string, unknown>;
    history: Array<{ state: string; timestamp: number }>;
  };
}
```

### **O que Criar**

#### **1. FSM Core System (`src/engine/fsm/index.ts`)**
```typescript
/**
 * Finite State Machine Implementation for Agents
 * Reutiliza Event System e State Management existente
 */

import { workflowEvent } from '../../runtime/index.js';
import type { StateManager } from '../../utils/thread-safe-state.js';
import { createLogger } from '../../observability/index.js';

// ===== FSM TYPES =====

export interface FSMTransition {
  target: string;
  guard?: (context: FSMContext, event: FSMEvent) => boolean;
  actions?: Array<(context: FSMContext, event: FSMEvent) => void | Promise<void>>;
}

export interface FSMState {
  entry?: (context: FSMContext) => void | Promise<unknown>;
  exit?: (context: FSMContext) => void | Promise<void>;
  on?: Record<string, string | FSMTransition>;
  timeout?: {
    after: number; // milliseconds
    target: string;
  };
  type?: 'normal' | 'final' | 'parallel';
}

export interface FSMEvent {
  type: string;
  data?: unknown;
  timestamp: number;
}

export interface FSMContext {
  currentState: string;
  previousState?: string;
  data: Record<string, unknown>;
  state: Record<string, unknown>; // Internal FSM state
  error?: unknown;
  history: Array<{
    state: string;
    event?: string;
    timestamp: number;
  }>;
}

export interface FSMDefinition {
  name: string;
  description: string;
  states: Record<string, FSMState>;
  initial: string;
  context?: Record<string, unknown>;
  guards?: Record<string, (context: FSMContext, event?: FSMEvent) => boolean>;
  actions?: Record<string, (context: FSMContext, event?: FSMEvent) => void | Promise<void>>;
}

// ===== FSM ENGINE =====

export class FiniteStateMachine {
  private context: FSMContext;
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  private logger = createLogger(`fsm:${this.definition.name}`);
  
  constructor(
    private definition: FSMDefinition,
    private stateManager: StateManager,
    private namespace: string,
    private eventEmitter?: (event: any) => void
  ) {
    this.context = {
      currentState: definition.initial,
      data: {},
      state: { ...definition.context },
      history: [{
        state: definition.initial,
        timestamp: Date.now()
      }]
    };
  }
  
  /**
   * Inicializar FSM e executar entry action do estado inicial
   */
  async initialize(initialData?: Record<string, unknown>): Promise<void> {
    if (initialData) {
      this.context.data = { ...this.context.data, ...initialData };
    }
    
    await this.persistContext();
    await this.enterState(this.definition.initial);
    
    this.logger.info('FSM initialized', {
      initial_state: this.definition.initial,
      context_keys: Object.keys(this.context.data)
    });
  }
  
  /**
   * Processar evento e transicionar se aplicável
   */
  async processEvent(event: FSMEvent): Promise<boolean> {
    const currentStateDefinition = this.definition.states[this.context.currentState];
    
    if (!currentStateDefinition?.on) {
      this.logger.debug('No transitions defined for current state', {
        currentState: this.context.currentState,
        eventType: event.type
      });
      return false;
    }
    
    const transitionDef = currentStateDefinition.on[event.type];
    
    if (!transitionDef) {
      this.logger.debug('No transition found for event', {
        currentState: this.context.currentState,
        eventType: event.type
      });
      return false;
    }
    
    // Parse transition (pode ser string ou objeto)
    const transition: FSMTransition = typeof transitionDef === 'string' 
      ? { target: transitionDef }
      : transitionDef;
    
    // Check guard condition
    if (transition.guard && !transition.guard(this.context, event)) {
      this.logger.debug('Transition guard failed', {
        currentState: this.context.currentState,
        targetState: transition.target,
        eventType: event.type
      });
      return false;
    }
    
    // Execute transition
    await this.executeTransition(transition, event);
    
    return true;
  }
  
  /**
   * Executar transição entre estados
   */
  private async executeTransition(transition: FSMTransition, event: FSMEvent): Promise<void> {
    const fromState = this.context.currentState;
    const toState = transition.target;
    
    this.logger.info('Executing state transition', {
      from: fromState,
      to: toState,
      event: event.type
    });
    
    // 1. Execute exit action of current state
    await this.exitState(fromState);
    
    // 2. Execute transition actions
    if (transition.actions) {
      for (const action of transition.actions) {
        await action(this.context, event);
      }
    }
    
    // 3. Update state
    this.context.previousState = fromState;
    this.context.currentState = toState;
    this.context.history.push({
      state: toState,
      event: event.type,
      timestamp: Date.now()
    });
    
    // 4. Persist new state
    await this.persistContext();
    
    // 5. Emit transition event
    if (this.eventEmitter) {
      this.eventEmitter(stateTransitionEvent.with({
        fromState,
        toState,
        trigger: event.type,
        timestamp: Date.now()
      }));
    }
    
    // 6. Enter new state
    await this.enterState(toState);
  }
  
  /**
   * Entrar em um estado (executar entry action)
   */
  private async enterState(stateName: string): Promise<void> {
    const stateDefinition = this.definition.states[stateName];
    
    if (!stateDefinition) {
      throw new Error(`State '${stateName}' not found in FSM definition`);
    }
    
    // Clear any existing timeout for this state
    this.clearStateTimeout(stateName);
    
    // Execute entry action
    if (stateDefinition.entry) {
      try {
        const result = await stateDefinition.entry(this.context);
        
        // If entry action returns data, it might be an event to process
        if (result && typeof result === 'object' && 'type' in result) {
          // Entry action returned an event, process it
          await this.processEvent(result as FSMEvent);
        }
      } catch (error) {
        this.logger.error('State entry action failed', error as Error, {
          state: stateName
        });
        
        // Transition to error state if available
        if (this.definition.states['error_handling']) {
          this.context.error = error;
          await this.executeTransition(
            { target: 'error_handling' },
            { type: 'entry_error', data: error, timestamp: Date.now() }
          );
        }
      }
    }
    
    // Set up timeout if defined
    if (stateDefinition.timeout) {
      const timeoutId = setTimeout(async () => {
        await this.processEvent({
          type: 'timeout',
          timestamp: Date.now()
        });
      }, stateDefinition.timeout.after);
      
      this.timeouts.set(stateName, timeoutId);
    }
    
    this.logger.debug('Entered state', {
      state: stateName,
      hasTimeout: !!stateDefinition.timeout
    });
  }
  
  /**
   * Sair de um estado (executar exit action)
   */
  private async exitState(stateName: string): Promise<void> {
    const stateDefinition = this.definition.states[stateName];
    
    // Clear state timeout
    this.clearStateTimeout(stateName);
    
    // Execute exit action
    if (stateDefinition?.exit) {
      try {
        await stateDefinition.exit(this.context);
      } catch (error) {
        this.logger.error('State exit action failed', error as Error, {
          state: stateName
        });
      }
    }
    
    this.logger.debug('Exited state', { state: stateName });
  }
  
  private clearStateTimeout(stateName: string): void {
    const timeoutId = this.timeouts.get(stateName);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeouts.delete(stateName);
    }
  }
  
  /**
   * Persistir contexto da FSM
   */
  private async persistContext(): Promise<void> {
    await this.stateManager.set(this.namespace, 'fsm_context', this.context);
  }
  
  /**
   * Recuperar contexto da FSM
   */
  async restoreContext(): Promise<boolean> {
    const savedContext = await this.stateManager.get<FSMContext>(this.namespace, 'fsm_context');
    
    if (savedContext) {
      this.context = savedContext;
      
      // Re-enter current state (but skip entry action to avoid re-execution)
      const stateDefinition = this.definition.states[this.context.currentState];
      if (stateDefinition?.timeout) {
        const timeoutId = setTimeout(async () => {
          await this.processEvent({
            type: 'timeout',
            timestamp: Date.now()
          });
        }, stateDefinition.timeout.after);
        
        this.timeouts.set(this.context.currentState, timeoutId);
      }
      
      this.logger.info('FSM context restored', {
        currentState: this.context.currentState,
        historyLength: this.context.history.length
      });
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Verificar se FSM está em estado final
   */
  isFinal(): boolean {
    const currentStateDefinition = this.definition.states[this.context.currentState];
    return currentStateDefinition?.type === 'final';
  }
  
  /**
   * Obter estado atual
   */
  getCurrentState(): string {
    return this.context.currentState;
  }
  
  /**
   * Obter contexto atual
   */
  getContext(): FSMContext {
    return { ...this.context };
  }
  
  /**
   * Atualizar dados do contexto
   */
  updateData(updates: Record<string, unknown>): void {
    this.context.data = { ...this.context.data, ...updates };
  }
  
  /**
   * Cleanup da FSM
   */
  async cleanup(): Promise<void> {
    // Clear all timeouts
    for (const timeoutId of this.timeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.timeouts.clear();
    
    // Exit current state
    await this.exitState(this.context.currentState);
    
    this.logger.info('FSM cleaned up', {
      finalState: this.context.currentState
    });
  }
}

// ===== FSM AGENT INTEGRATION =====

export interface StateMachineAgentDefinition {
  name: string;
  description: string;
  fsm: FSMDefinition;
  eventMapping?: {
    // Map agent inputs to FSM events
    inputToEvent: (input: unknown, context: FSMContext) => FSMEvent | null;
    // Map FSM state to agent output
    stateToOutput: (state: string, context: FSMContext) => unknown;
  };
}

export class StateMachineAgentEngine {
  private fsm: FiniteStateMachine;
  private logger = createLogger(`fsm-agent:${this.definition.name}`);
  
  constructor(
    private definition: StateMachineAgentDefinition,
    private stateManager: StateManager,
    private namespace: string
  ) {
    this.fsm = new FiniteStateMachine(
      definition.fsm,
      stateManager,
      namespace
    );
  }
  
  async initialize(initialData?: Record<string, unknown>): Promise<void> {
    await this.fsm.initialize(initialData);
  }
  
  async process(input: unknown): Promise<{
    state: string;
    output: unknown;
    isFinal: boolean;
    context: FSMContext;
  }> {
    // Convert input to FSM event
    const event = this.definition.eventMapping?.inputToEvent(input, this.fsm.getContext()) || {
      type: 'input',
      data: input,
      timestamp: Date.now()
    };
    
    // Process event through FSM
    const transitioned = await this.fsm.processEvent(event);
    
    const currentState = this.fsm.getCurrentState();
    const context = this.fsm.getContext();
    
    // Convert state to output
    const output = this.definition.eventMapping?.stateToOutput(currentState, context) || {
      state: currentState,
      message: `FSM is in state: ${currentState}`,
      data: context.data
    };
    
    this.logger.debug('FSM agent processed input', {
      input,
      currentState,
      transitioned,
      isFinal: this.fsm.isFinal()
    });
    
    return {
      state: currentState,
      output,
      isFinal: this.fsm.isFinal(),
      context
    };
  }
  
  async cleanup(): Promise<void> {
    await this.fsm.cleanup();
  }
}

/**
 * Factory function para criar FSM agents
 * Integra com AgentDefinition existente
 */
export function defineStateMachineAgent(definition: StateMachineAgentDefinition): AgentDefinition {
  return {
    name: definition.name,
    description: definition.description,
    
    async think(input: unknown, context: AgentContext) {
      // Create or restore FSM engine
      const fsmEngine = new StateMachineAgentEngine(
        definition,
        context.stateManager as any,
        `fsm:${context.executionId}`
      );
      
      // Try to restore previous state, otherwise initialize
      const restored = await fsmEngine.fsm.restoreContext();
      if (!restored) {
        await fsmEngine.initialize();
      }
      
      // Process input through FSM
      const result = await fsmEngine.process(input);
      
      // Clean up if FSM reached final state
      if (result.isFinal) {
        await fsmEngine.cleanup();
      }
      
      return {
        reasoning: `FSM transitioned to state: ${result.state}. Final: ${result.isFinal}`,
        action: {
          type: 'final_answer',
          content: result.output
        }
      };
    }
  };
}

// Events for FSM system
export const stateTransitionEvent = workflowEvent<{
  fromState: string;
  toState: string;
  trigger: string;
  timestamp: number;
}>('fsm.transition');

export const stateEntryEvent = workflowEvent<{
  state: string;
  context: Record<string, unknown>;
  timestamp: number;
}>('fsm.state.entry');

export const stateExitEvent = workflowEvent<{
  state: string;
  context: Record<string, unknown>;
  timestamp: number;
}>('fsm.state.exit');
```

### **API de Uso**
```typescript
// Definir FSM agent
const orderProcessor = defineStateMachineAgent({
  name: 'order-processor',
  description: 'Processes customer orders through defined states',
  
  fsm: {
    name: 'order-processing',
    description: 'Order processing workflow',
    
    states: {
      'validating': {
        entry: async (context) => {
          console.log('Starting order validation...');
          // Simulate validation
          setTimeout(() => {
            // This would trigger validation_success or validation_failed
          }, 1000);
        },
        
        on: {
          'validation_success': 'processing_payment',
          'validation_failed': 'error_handling',
          'timeout': 'error_handling'
        },
        
        timeout: {
          after: 30000,
          target: 'error_handling'
        }
      },
      
      'processing_payment': {
        entry: async (context) => {
          console.log('Processing payment...');
          // Payment processing logic
        },
        
        on: {
          'payment_success': 'completed',
          'payment_failed': 'error_handling'
        }
      },
      
      'completed': {
        type: 'final',
        entry: async (context) => {
          console.log('Order completed successfully!');
        }
      },
      
      'error_handling': {
        type: 'final',
        entry: async (context) => {
          console.log('Order processing failed:', context.error);
        }
      }
    },
    
    initial: 'validating',
    
    context: {
      orderId: null,
      customerInfo: null,
      paymentInfo: null
    }
  },
  
  eventMapping: {
    inputToEvent: (input: any, context) => {
      if (input.type === 'new_order') {
        return {
          type: 'start_processing',
          data: input.orderData,
          timestamp: Date.now()
        };
      }
      return null;
    },
    
    stateToOutput: (state, context) => {
      return {
        currentState: state,
        orderStatus: state,
        data: context.data
      };
    }
  }
});

// Usar em orchestration
const orchestration = createOrchestration({
  debug: true
});

orchestration.createAgent(orderProcessor);

const result = await orchestration.callAgent('OrderProcessor', {
  type: 'new_order',
  orderData: {
    items: ['item1', 'item2'],
    total: 99.99,
    customerId: 'cust_123'
  }
});
```