# 🚀 Plano de Implementação: Parallel Tool Execution & Autonomous Intelligence

## 📋 **Status do Projeto**

**Data:** 2025-01-06  
**Framework:** Kodus Flow  
**Objetivo:** Implementar parallel tool execution com autonomous intelligence  
**Contexto:** Agent framework SDK com camadas Core → Engine → Orchestration → User  

---

## 🏗️ **ARQUITETURA ATUAL - BASELINE**

### **✅ Já Implementado (Base Sólida)**

#### **🧱 Core Types & Context**
```typescript
// agent-types.ts - ATUALIZADO com separated context
- AgentContext com user/system separation
- AgentExecutionOptions com thread support
- Action types básicos: tool_call, final_answer, delegate_to_agent
- Context factories com memory/persistence integration
```

#### **⚙️ Engine Layer**
```typescript
// agent-core.ts & agent-engine.ts
- Single tool execution via ToolEngine
- Event-driven execution via KernelHandler
- State management via StateService
- Lifecycle management (start, pause, resume, stop)
- Error handling com retry logic

// tool-engine.ts  
- Tool registration e validation
- executeCall() com timeout/retry
- Zod schema integration
- Event emission via KernelHandler

// planning/planner.ts
- CoTPlanner, ToTPlanner, GraphPlanner
- PlannerHandler com strategy switching
- Event integration
- Callback system

// routing/router.ts
- Multiple routing strategies
- Agent selection criteria
- Performance metrics tracking
- Fallback mechanisms
```

#### **🏭 Orchestration Layer**
```typescript
// sdk-orchestrator.ts
- createAgent() API simplificada
- Action mapping básico
- Engine coordination
- Event integration
```

#### **🌊 Infrastructure**
```typescript
// StreamManager - Completo
- Event stream operations
- AsyncIterator support
- Resource cleanup

// KernelHandler - Completo  
- Event emission com delivery guarantees
- ack/nack support
- Runtime integration
```

---

## 🎯 **IMPLEMENTAÇÃO REQUERIDA - ROADMAP DETALHADO**

### **📅 PHASE 1: FOUNDATION (Week 1) - 12 tarefas**

#### **🧱 Core Types Enhancement**

**📄 `src/core/types/agent-types.ts`**
```typescript
// STATUS: ⏳ Pendente
// PRIORIDADE: 🔴 Crítica

// 1. Add new action types to agentActionTypeSchema
export const agentActionTypeSchema = z.enum([
    // ... existing types
    'parallel_tools',      // ← NEW: Parallel tool execution
    'sequential_tools',    // ← NEW: Sequential tool execution  
    'conditional_tools',   // ← NEW: Conditional tool execution
    'mixed_tools',         // ← NEW: Mixed strategy execution
]);

// 2. Add new action interfaces
export interface ParallelToolsAction {
    type: 'parallel_tools';
    tools: ToolCall[];
    config?: ParallelToolsConfig;
}

export interface SequentialToolsAction {
    type: 'sequential_tools';
    tools: SequentialToolCall[];
    config?: SequentialToolsConfig;
}

export interface ConditionalToolsAction {
    type: 'conditional_tools';
    conditions: ConditionalToolCall[];
    fallback?: ToolCall[];
}

// 3. Add configuration types
export interface ParallelToolsConfig {
    maxConcurrency?: number;
    failFast?: boolean;
    aggregateResults?: boolean;
    timeout?: number;
}

export interface SequentialToolsConfig {
    stopOnError?: boolean;
    passResults?: boolean;
    chainTimeout?: number;
}

// 4. Enhanced ToolCall for dependencies
export interface SequentialToolCall extends ToolCall {
    dependsOn?: string;
    passPreviousResult?: boolean;
}

export interface ConditionalToolCall {
    condition: string;
    tools: ToolCall[];
    priority?: number;
}
```

**📄 `src/core/types/tool-types.ts`**
```typescript
// STATUS: ⏳ Pendente  
// PRIORIDADE: 🔴 Crítica

// 1. Add tool execution strategy types
export type ToolExecutionPattern = 
    | 'parallel' 
    | 'sequential' 
    | 'conditional'
    | 'batched'
    | 'streaming'
    | 'adaptive';

export interface ToolExecutionStrategy {
    pattern: ToolExecutionPattern;
    confidence: number;
    source: 'rule-based' | 'heuristic' | 'llm' | 'adaptive';
    metadata?: Record<string, unknown>;
}

export interface ToolExecutionRule {
    id: string;
    condition: (input: unknown, tools: string[]) => boolean;
    strategy: ToolExecutionPattern;
    priority: number;
    description?: string;
}

// 2. Add execution result types
export interface ParallelToolResult {
    name: string;
    result?: unknown;
    error?: string;
    duration: number;
    startTime: number;
    endTime: number;
}

export interface ToolExecutionMetrics {
    totalDuration: number;
    toolCount: number;
    successCount: number;
    errorCount: number;
    concurrency: number;
    pattern: ToolExecutionPattern;
}
```

**📄 `src/core/types/intelligence-types.ts` (NOVO)**
```typescript
// STATUS: ⏳ Pendente
// PRIORIDADE: 🔴 Crítica

// 1. Agent intelligence types
export interface AgentIntelligence {
    toolExecutionHints?: ToolExecutionHint;
    plannerSuggestions?: PlannerSuggestion[];
    routerHints?: RouterHint;
    contextClues?: ContextClue[];
    performancePreference?: 'speed' | 'accuracy' | 'cost' | 'balanced';
}

export interface ToolExecutionHint {
    suggestedPattern: ToolExecutionPattern;
    confidence: number;
    reasoning: string;
    alternativePatterns?: ToolExecutionPattern[];
}

export interface PlannerSuggestion {
    stepId: string;
    toolStrategy: ToolExecutionPattern;
    tools: string[];
    confidence: number;
    reasoning: string;
}

export interface RouterHint {
    selectedRoute: string;
    toolStrategy: ToolExecutionPattern;
    confidence: number;
    criteria: Record<string, unknown>;
}

export interface ContextClue {
    type: 'keyword' | 'semantic' | 'performance' | 'user_preference';
    value: unknown;
    weight: number;
    source: string;
}
```

#### **⚙️ ToolEngine Enhancement**

**📄 `src/engine/tools/tool-engine.ts`**
```typescript
// STATUS: ⏳ Pendente
// PRIORIDADE: 🔴 Crítica

// 1. Add executeParallelTools method
async executeParallelTools(
    toolCalls: ToolCall[],
    config?: ParallelToolsConfig
): Promise<ParallelToolResult[]> {
    const startTime = Date.now();
    const maxConcurrency = config?.maxConcurrency || 5;
    const failFast = config?.failFast ?? false;
    
    // Emit start event
    if (this.kernelHandler) {
        this.kernelHandler.emit('tools.parallel.start', {
            toolCount: toolCalls.length,
            maxConcurrency,
            failFast,
            timestamp: startTime
        });
    }
    
    // Implementation with batching and concurrency control
    const batches = this.createBatches(toolCalls, maxConcurrency);
    const allResults: ParallelToolResult[] = [];
    
    for (const batch of batches) {
        if (failFast && allResults.some(r => r.error)) break;
        
        const batchPromises = batch.map(async (toolCall) => {
            const toolStartTime = Date.now();
            try {
                const result = await this.executeCall(
                    toolCall.toolName as ToolId, 
                    toolCall.input
                );
                return {
                    name: toolCall.toolName,
                    result,
                    duration: Date.now() - toolStartTime,
                    startTime: toolStartTime,
                    endTime: Date.now()
                };
            } catch (error) {
                return {
                    name: toolCall.toolName,
                    error: (error as Error).message,
                    duration: Date.now() - toolStartTime,
                    startTime: toolStartTime,
                    endTime: Date.now()
                };
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        allResults.push(...batchResults);
        
        if (failFast && batchResults.some(r => r.error)) break;
    }
    
    // Emit completion event
    if (this.kernelHandler) {
        this.kernelHandler.emit('tools.parallel.complete', {
            results: allResults,
            duration: Date.now() - startTime,
            metrics: this.calculateMetrics(allResults, 'parallel')
        });
    }
    
    return allResults;
}

// 2. Add executeSequentialTools method
async executeSequentialTools(
    toolCalls: SequentialToolCall[],
    config?: SequentialToolsConfig
): Promise<ParallelToolResult[]> {
    // Implementation with dependency management
    // ... detailed implementation
}

// 3. Add executeConditionalTools method
async executeConditionalTools(
    conditionalCalls: ConditionalToolCall[],
    context: Record<string, unknown>
): Promise<ParallelToolResult[]> {
    // Implementation with condition evaluation
    // ... detailed implementation
}

// 4. Add utility methods
private createBatches<T>(items: T[], batchSize: number): T[][] {
    // Batching implementation
}

private calculateMetrics(
    results: ParallelToolResult[], 
    pattern: ToolExecutionPattern
): ToolExecutionMetrics {
    // Metrics calculation
}
```

#### **🤖 AgentCore Enhancement**

**📄 `src/engine/agents/agent-core.ts`**
```typescript
// STATUS: ⏳ Pendente
// PRIORIDADE: 🔴 Crítica

// 1. Enhance processAction method
private async processAction(
    thought: AgentThought<TContent>,
    context: AgentContext,
    correlationId: string,
    input: unknown,
): Promise<{
    toolUsed: boolean;
    updatedInput?: unknown;
    events: AnyEvent[];
}> {
    // ... existing code ...
    
    // NEW: Handle parallel tools
    if (actionType === 'parallel_tools' && this.config.enableTools && this.toolEngine) {
        return await this.processParallelToolsAction(
            thought.action as ParallelToolsAction,
            context,
            correlationId
        );
    }
    
    // NEW: Handle sequential tools
    if (actionType === 'sequential_tools' && this.config.enableTools && this.toolEngine) {
        return await this.processSequentialToolsAction(
            thought.action as SequentialToolsAction,
            context,
            correlationId
        );
    }
    
    // NEW: Handle conditional tools
    if (actionType === 'conditional_tools' && this.config.enableTools && this.toolEngine) {
        return await this.processConditionalToolsAction(
            thought.action as ConditionalToolsAction,
            context,
            correlationId
        );
    }
    
    // ... rest of existing code
}

// 2. Add parallel tools processing
private async processParallelToolsAction(
    action: ParallelToolsAction,
    context: AgentContext,
    correlationId: string
): Promise<{
    toolUsed: boolean;
    updatedInput?: unknown;
    events: AnyEvent[];
}> {
    try {
        const results = await this.toolEngine!.executeParallelTools(
            action.tools,
            action.config
        );
        
        // Update context
        context.state.set('lastParallelToolsResults', results);
        context.system!.toolsUsed += action.tools.length;
        
        // Aggregate results
        const updatedInput = action.config?.aggregateResults 
            ? this.aggregateToolResults(results)
            : results;
        
        // Emit success event with ACK
        if (this.kernelHandler) {
            const kernel = this.kernelHandler.getKernel();
            const runtime = kernel?.getRuntime();
            
            if (runtime?.emitAsync) {
                const emitResult = await runtime.emitAsync(
                    'agent.parallel_tools.completed',
                    {
                        agentName: context.agentName,
                        toolCount: action.tools.length,
                        successCount: results.filter(r => !r.error).length,
                        correlationId,
                        sessionId: context.sessionId,
                        results
                    },
                    {
                        deliveryGuarantee: 'at-least-once',
                        correlationId,
                    },
                );
                
                if (emitResult.success && runtime.ack) {
                    await runtime.ack(emitResult.eventId);
                }
            }
        }
        
        return {
            toolUsed: true,
            updatedInput,
            events: []
        };
        
    } catch (error) {
        // Error handling with NACK
        this.logger.error('Parallel tools execution failed', error as Error, {
            agentName: context.agentName,
            correlationId
        });
        
        if (this.kernelHandler) {
            const kernel = this.kernelHandler.getKernel();
            const runtime = kernel?.getRuntime();
            
            if (runtime?.emitAsync) {
                const emitResult = await runtime.emitAsync(
                    'agent.parallel_tools.error',
                    {
                        agentName: context.agentName,
                        error: (error as Error).message,
                        correlationId,
                        sessionId: context.sessionId,
                    },
                    {
                        deliveryGuarantee: 'at-least-once',
                        correlationId,
                    },
                );
                
                if (emitResult.success && runtime.nack) {
                    await runtime.nack(emitResult.eventId, (error as Error).message);
                }
            }
        }
        
        throw error;
    }
}

// 3. Add context enhancement
protected async processAgentThinking(
    agent: AgentDefinition,
    input: unknown,
    context: AgentContext,
    correlationId: string,
    maxIterations?: number,
): Promise<{...}> {
    
    while (iterations < maxIterationsCount) {
        // ENHANCE context with intelligence
        const enhancedContext = this.enhanceContextWithIntelligence(context, input);
        
        const thought = await this.executeAgentThink(agent, input, enhancedContext);
        
        // ... rest of thinking loop
    }
}

// 4. Add intelligence enhancement
private enhanceContextWithIntelligence(
    context: AgentContext, 
    input: unknown
): AgentContext {
    const intelligence: AgentIntelligence = {
        toolExecutionHints: {
            suggestedPattern: this.analyzeInputForToolPattern(input),
            confidence: 0.8,
            reasoning: 'Based on input analysis',
            alternativePatterns: ['sequential', 'conditional']
        },
        plannerSuggestions: context.state?.get('plannerSuggestions') as PlannerSuggestion[],
        routerHints: context.state?.get('routerHints') as RouterHint,
        contextClues: this.extractContextClues(input),
        performancePreference: this.derivePerformancePreference(input)
    };
    
    return {
        ...context,
        intelligence,
        // Add to system context
        system: {
            ...context.system!,
            intelligence
        }
    };
}

// 5. Add intelligence analysis methods
private analyzeInputForToolPattern(input: unknown): ToolExecutionPattern {
    const inputStr = String(input).toLowerCase();
    
    // Keyword analysis
    const parallelKeywords = ['simultâneo', 'paralelo', 'rápido', 'múltiplos', 'todos'];
    const sequentialKeywords = ['sequência', 'ordem', 'passo', 'depois', 'primeiro'];
    
    const parallelScore = parallelKeywords.reduce((score, keyword) => 
        inputStr.includes(keyword) ? score + 1 : score, 0);
    const sequentialScore = sequentialKeywords.reduce((score, keyword) =>
        inputStr.includes(keyword) ? score + 1 : score, 0);
        
    if (parallelScore > sequentialScore) return 'parallel';
    if (sequentialScore > parallelScore) return 'sequential';
    return 'adaptive';
}

private extractContextClues(input: unknown): ContextClue[] {
    // Context clue extraction implementation
}

private derivePerformancePreference(input: unknown): 'speed' | 'accuracy' | 'cost' | 'balanced' {
    // Performance preference derivation
}

private aggregateToolResults(results: ParallelToolResult[]): unknown {
    // Result aggregation implementation
}
```

#### **🏭 Orchestrator Enhancement**

**📄 `src/orchestration/sdk-orchestrator.ts`**
```typescript
// STATUS: ⏳ Pendente
// PRIORIDADE: 🔴 Crítica

// 1. Enhance action mapping (around line 280)
const adaptedThink = async (input: TInput, context: AgentContext) => {
    // ... existing code ...
    
    // NEW: Map parallel tools actions
    if (action.type === 'parallel_tools' && action.content) {
        const content = action.content as {
            tools: Array<{ name: string; input: unknown }>;
            config?: ParallelToolsConfig;
        };
        
        mappedAction = {
            type: 'parallel_tools' as const,
            tools: content.tools.map(tool => ({
                id: IdGenerator.callId(),
                toolName: tool.name,
                arguments: tool.input,
                timestamp: Date.now(),
                correlationId
            })),
            config: content.config || {}
        } as ParallelToolsAction;
    }
    
    // NEW: Map sequential tools actions
    else if (action.type === 'sequential_tools' && action.content) {
        const content = action.content as {
            tools: Array<{ name: string; input: unknown; dependsOn?: string }>;
            config?: SequentialToolsConfig;
        };
        
        mappedAction = {
            type: 'sequential_tools' as const,
            tools: content.tools.map(tool => ({
                id: IdGenerator.callId(),
                toolName: tool.name,
                arguments: tool.input,
                dependsOn: tool.dependsOn,
                timestamp: Date.now(),
                correlationId
            })),
            config: content.config || {}
        } as SequentialToolsAction;
    }
    
    // NEW: Map conditional tools actions
    else if (action.type === 'conditional_tools' && action.content) {
        const content = action.content as {
            conditions: Array<{
                condition: string;
                tools: Array<{ name: string; input: unknown }>;
            }>;
            fallback?: Array<{ name: string; input: unknown }>;
        };
        
        mappedAction = {
            type: 'conditional_tools' as const,
            conditions: content.conditions.map(cond => ({
                condition: cond.condition,
                tools: cond.tools.map(tool => ({
                    id: IdGenerator.callId(),
                    toolName: tool.name,
                    arguments: tool.input,
                    timestamp: Date.now(),
                    correlationId
                }))
            })),
            fallback: content.fallback?.map(tool => ({
                id: IdGenerator.callId(),
                toolName: tool.name,
                arguments: tool.input,
                timestamp: Date.now(),
                correlationId
            }))
        } as ConditionalToolsAction;
    }
    
    // ... rest of existing code
};
```

---

### **📅 PHASE 2: INTELLIGENCE (Week 2) - 8 tarefas**

#### **🧠 Planner Intelligence Enhancement**

**📄 `src/engine/planning/planner.ts`**
```typescript
// STATUS: ⏳ Pendente
// PRIORIDADE: 🔴 Crítica

// 1. Enhance CoTPlanner with intelligence
export class CoTPlanner implements Planner {
    async createPlan(
        goal: string | string[],
        context: AgentContext,
        options?: PlannerOptions,
        callbacks?: PlannerCallbacks,
    ): Promise<Plan> {
        // ... existing code ...
        
        // NEW: Analyze parallelization opportunities
        const parallelizationOpportunities = this.analyzeParallelization(goal, context);
        
        if (parallelizationOpportunities.length > 0) {
            steps.push({
                id: 'parallel-execution',
                description: `Execute ${parallelizationOpportunities.join(', ')} in parallel`,
                tool: undefined,
                params: {
                    executionStrategy: 'parallel_tools',
                    suggestedTools: parallelizationOpportunities,
                    reasoning: 'Multiple independent tools identified'
                }
            });
            
            // Add to context for agent intelligence
            context.state.set('plannerSuggestions', [{
                stepId: 'parallel-execution',
                toolStrategy: 'parallel',
                tools: parallelizationOpportunities,
                confidence: 0.8,
                reasoning: 'Goal benefits from parallel tool execution'
            }]);
        }
        
        // ... rest of implementation
    }
    
    private analyzeParallelization(
        goal: string | string[], 
        context: AgentContext
    ): string[] {
        const goalText = Array.isArray(goal) ? goal.join(' ') : goal;
        const availableTools = context.availableTools || [];
        const opportunities: string[] = [];
        
        // Research/Search parallelization
        if (goalText.includes('pesquisar') || goalText.includes('buscar')) {
            const searchTools = availableTools
                .filter(tool => tool.name.includes('search') || 
                              tool.name.includes('find') || 
                              tool.name.includes('get'))
                .map(tool => tool.name);
            
            if (searchTools.length > 1) {
                opportunities.push(...searchTools);
            }
        }
        
        // Analysis parallelization
        if (goalText.includes('analisar') || goalText.includes('verificar')) {
            const analysisTools = availableTools
                .filter(tool => tool.name.includes('analyze') || 
                              tool.name.includes('check') || 
                              tool.name.includes('validate'))
                .map(tool => tool.name);
            
            if (analysisTools.length > 1) {
                opportunities.push(...analysisTools);
            }
        }
        
        // Data gathering parallelization
        if (goalText.includes('coletar') || goalText.includes('obter')) {
            const dataTools = availableTools
                .filter(tool => tool.name.includes('get') || 
                              tool.name.includes('fetch') || 
                              tool.name.includes('retrieve'))
                .map(tool => tool.name);
            
            if (dataTools.length > 1) {
                opportunities.push(...dataTools);
            }
        }
        
        return opportunities;
    }
}

// 2. Enhance ToTPlanner with branch strategies
export class ToTPlanner implements Planner {
    async createPlan(
        goal: string | string[],
        context: AgentContext,
        options?: PlannerOptions,
        callbacks?: PlannerCallbacks,
    ): Promise<Plan> {
        // ... existing code ...
        
        // NEW: Create branches with different tool execution strategies
        const toolStrategies = this.identifyToolExecutionStrategies(goal, context);
        
        toolStrategies.forEach((strategy, index) => {
            steps.push({
                id: `strategy-branch-${index + 1}`,
                description: `Explore ${strategy.pattern} execution approach`,
                tool: undefined,
                params: {
                    executionStrategy: strategy.pattern,
                    confidence: strategy.confidence,
                    reasoning: strategy.reasoning,
                    suggestedTools: strategy.tools
                }
            });
        });
        
        // Add synthesis step
        steps.push({
            id: 'strategy-synthesis',
            description: 'Synthesize best execution strategy from explored branches',
            dependencies: toolStrategies.map((_, index) => `strategy-branch-${index + 1}`),
            critical: true
        });
        
        // ... rest of implementation
    }
    
    private identifyToolExecutionStrategies(
        goal: string | string[],
        context: AgentContext
    ): Array<{
        pattern: ToolExecutionPattern;
        confidence: number;
        reasoning: string;
        tools: string[];
    }> {
        const strategies = [];
        const availableTools = context.availableTools?.map(t => t.name) || [];
        
        // Strategy 1: Parallel execution
        if (availableTools.length > 2) {
            strategies.push({
                pattern: 'parallel' as ToolExecutionPattern,
                confidence: 0.8,
                reasoning: 'Multiple tools available for parallel execution',
                tools: availableTools.slice(0, 3)
            });
        }
        
        // Strategy 2: Sequential execution
        strategies.push({
            pattern: 'sequential' as ToolExecutionPattern,
            confidence: 0.6,
            reasoning: 'Sequential execution ensures proper data flow',
            tools: availableTools.slice(0, 2)
        });
        
        // Strategy 3: Conditional execution
        if (availableTools.length > 1) {
            strategies.push({
                pattern: 'conditional' as ToolExecutionPattern,
                confidence: 0.7,
                reasoning: 'Conditional execution based on intermediate results',
                tools: availableTools.slice(0, 2)
            });
        }
        
        return strategies;
    }
}
```

#### **🎯 Router Intelligence Enhancement**

**📄 `src/engine/routing/router.ts`**
```typescript
// STATUS: ⏳ Pendente
// PRIORIDADE: 🔴 Crítica

// 1. Enhance RouterConfig interface
export interface RouterConfig<TSchema extends z.ZodType = z.ZodType> {
    // ... existing config ...
    
    // NEW: Tool execution strategy configuration
    toolExecutionStrategy?: {
        defaultPattern: ToolExecutionPattern;
        rules: ToolExecutionRule[];
        intelligence: 'heuristic' | 'llm' | 'learned' | 'adaptive';
        confidence_threshold?: number;
    };
}

// 2. Enhance Router class
export class Router<TSchema extends z.ZodType = z.ZodType> {
    async route<TInput extends z.infer<TSchema>, TOutput = unknown>(
        input: TInput,
        context?: Partial<AgentContext>,
        criteria?: AgentSelectionCriteria,
    ): Promise<RoutingResult<TOutput>> {
        // ... existing routing logic ...
        
        // NEW: Determine tool execution strategy
        const toolStrategy = await this.determineToolExecutionStrategy(input, context);
        
        // Enhance context with router hints
        const enhancedContext = {
            ...context,
            routerHints: {
                selectedRoute,
                toolStrategy: toolStrategy.pattern,
                confidence: toolStrategy.confidence,
                criteria: finalCriteria
            }
        };
        
        // Add to context state for agent intelligence
        const agentContext = {
            ...enhancedContext,
            state: new Map([
                ...(enhancedContext.state?.entries() || []),
                ['routerHints', enhancedContext.routerHints],
                ['toolExecutionStrategy', toolStrategy]
            ])
        } as AgentContext;
        
        // ... continue with agent execution
        const thought = await agent.think(validatedInput, agentContext);
        
        // ... rest of implementation
    }
    
    // NEW: Tool execution strategy determination
    async determineToolExecutionStrategy(
        input: unknown, 
        context?: Partial<AgentContext>
    ): Promise<ToolExecutionStrategy> {
        const inputStr = String(input).toLowerCase();
        const availableTools = context?.availableTools?.map(t => t.name) || [];
        
        // Rule-based intelligence
        if (this.config.toolExecutionStrategy?.rules) {
            for (const rule of this.config.toolExecutionStrategy.rules) {
                if (rule.condition(input, availableTools)) {
                    return {
                        pattern: rule.strategy,
                        confidence: 0.9,
                        source: 'rule-based',
                        metadata: { ruleId: rule.id, priority: rule.priority }
                    };
                }
            }
        }
        
        // Heuristic intelligence
        const heuristicStrategy = this.analyzeHeuristics(inputStr, availableTools);
        if (heuristicStrategy.confidence > 0.7) {
            return heuristicStrategy;
        }
        
        // Adaptive intelligence
        return this.adaptiveStrategySelection(input, availableTools);
    }
    
    private analyzeHeuristics(
        inputStr: string, 
        availableTools: string[]
    ): ToolExecutionStrategy {
        // Speed indicators
        if (inputStr.includes('rápido') || inputStr.includes('urgente') || 
            inputStr.includes('imediato')) {
            return {
                pattern: 'parallel',
                confidence: 0.9,
                source: 'heuristic',
                metadata: { reason: 'speed_requirement' }
            };
        }
        
        // Order indicators
        if (inputStr.includes('sequência') || inputStr.includes('ordem') || 
            inputStr.includes('passo') || inputStr.includes('depois')) {
            return {
                pattern: 'sequential',
                confidence: 0.9,
                source: 'heuristic',
                metadata: { reason: 'order_requirement' }
            };
        }
        
        // Conditional indicators
        if (inputStr.includes('se') || inputStr.includes('caso') || 
            inputStr.includes('depende') || inputStr.includes('condição')) {
            return {
                pattern: 'conditional',
                confidence: 0.8,
                source: 'heuristic',
                metadata: { reason: 'conditional_logic' }
            };
        }
        
        // Multiple tools available
        if (availableTools.length > 3) {
            return {
                pattern: 'parallel',
                confidence: 0.7,
                source: 'heuristic',
                metadata: { reason: 'multiple_tools_available', toolCount: availableTools.length }
            };
        }
        
        return {
            pattern: 'sequential',
            confidence: 0.5,
            source: 'heuristic',
            metadata: { reason: 'default_fallback' }
        };
    }
    
    private adaptiveStrategySelection(
        input: unknown, 
        availableTools: string[]
    ): ToolExecutionStrategy {
        // Adaptive logic based on context and history
        const toolCount = availableTools.length;
        
        if (toolCount === 0) {
            return {
                pattern: 'sequential',
                confidence: 1.0,
                source: 'adaptive',
                metadata: { reason: 'no_tools_available' }
            };
        }
        
        if (toolCount === 1) {
            return {
                pattern: 'sequential',
                confidence: 1.0,
                source: 'adaptive',
                metadata: { reason: 'single_tool_available' }
            };
        }
        
        if (toolCount >= 4) {
            return {
                pattern: 'parallel',
                confidence: 0.8,
                source: 'adaptive',
                metadata: { reason: 'many_tools_favor_parallel', toolCount }
            };
        }
        
        return {
            pattern: 'sequential',
            confidence: 0.6,
            source: 'adaptive',
            metadata: { reason: 'moderate_tools_favor_sequential', toolCount }
        };
    }
}
```

---

### **📅 PHASE 3: TESTING & VALIDATION (Week 3) - 7 tarefas**

#### **🧪 Unit Tests**

**📄 `tests/engine/tools/tool-engine.parallel.test.ts` (NOVO)**
```typescript
// STATUS: ⏳ Pendente
// PRIORIDADE: 🔴 Crítica

describe('ToolEngine Parallel Execution', () => {
    let toolEngine: ToolEngine;
    let mockKernelHandler: jest.Mocked<KernelHandler>;
    
    beforeEach(() => {
        mockKernelHandler = createMockKernelHandler();
        toolEngine = new ToolEngine({ tenantId: 'test' }, mockKernelHandler);
    });
    
    describe('executeParallelTools', () => {
        it('should execute multiple tools in parallel', async () => {
            // Setup
            const mockTool1 = createMockTool('tool1');
            const mockTool2 = createMockTool('tool2');
            toolEngine.registerTool(mockTool1);
            toolEngine.registerTool(mockTool2);
            
            const toolCalls = [
                { id: '1', toolName: 'tool1', arguments: { input: 'test1' }, timestamp: Date.now() },
                { id: '2', toolName: 'tool2', arguments: { input: 'test2' }, timestamp: Date.now() }
            ];
            
            // Execute
            const results = await toolEngine.executeParallelTools(toolCalls);
            
            // Verify
            expect(results).toHaveLength(2);
            expect(results[0].name).toBe('tool1');
            expect(results[1].name).toBe('tool2');
            expect(results[0].result).toBeDefined();
            expect(results[1].result).toBeDefined();
        });
        
        it('should respect maxConcurrency configuration', async () => {
            // Test concurrency limits
        });
        
        it('should handle failFast configuration', async () => {
            // Test fail fast behavior
        });
        
        it('should emit proper events via KernelHandler', async () => {
            // Test event emission
        });
    });
    
    describe('executeSequentialTools', () => {
        it('should execute tools in sequence with dependency management', async () => {
            // Test sequential execution
        });
        
        it('should pass results between dependent tools', async () => {
            // Test result passing
        });
        
        it('should stop on error when configured', async () => {
            // Test error handling
        });
    });
});
```

**📄 `tests/engine/agents/agent-core.intelligence.test.ts` (NOVO)**
```typescript
// STATUS: ⏳ Pendente
// PRIORIDADE: 🔴 Crítica

describe('AgentCore Intelligence Features', () => {
    let agentCore: AgentCore;
    
    beforeEach(() => {
        agentCore = new AgentCore(mockAgentDefinition, mockToolEngine, mockConfig);
    });
    
    describe('enhanceContextWithIntelligence', () => {
        it('should enhance context with tool execution hints', () => {
            // Test context enhancement
        });
        
        it('should analyze input for tool patterns', () => {
            // Test pattern analysis
        });
        
        it('should extract context clues correctly', () => {
            // Test clue extraction
        });
    });
    
    describe('processParallelToolsAction', () => {
        it('should process parallel tools action successfully', async () => {
            // Test parallel processing
        });
        
        it('should emit proper events with ACK/NACK', async () => {
            // Test event handling
        });
        
        it('should handle errors gracefully', async () => {
            // Test error scenarios
        });
    });
});
```

#### **🧪 Integration Tests**

**📄 `tests/integration/parallel-tools-flow.integration.test.ts` (NOVO)**
```typescript
// STATUS: ⏳ Pendente
// PRIORIDADE: 🔴 Crítica

describe('Parallel Tools Integration Flow', () => {
    let orchestrator: SDKOrchestrator;
    
    beforeEach(async () => {
        orchestrator = createOrchestration();
        
        // Register test tools
        orchestrator.createTool({
            name: 'search_web',
            description: 'Search the web',
            inputSchema: z.object({ query: z.string() }),
            execute: async (input) => ({ results: [`web result for ${input.query}`] })
        });
        
        orchestrator.createTool({
            name: 'search_docs',
            description: 'Search documentation',
            inputSchema: z.object({ query: z.string() }),
            execute: async (input) => ({ results: [`doc result for ${input.query}`] })
        });
    });
    
    it('should execute end-to-end parallel tool flow', async () => {
        // Create agent with parallel tools capability
        await orchestrator.createAgent({
            name: 'parallel-researcher',
            description: 'Agent that uses parallel tools',
            think: async (input: string, context) => {
                if (input.includes('pesquisar')) {
                    return {
                        reasoning: 'Will search multiple sources in parallel',
                        action: {
                            type: 'parallel_tools',
                            content: {
                                tools: [
                                    { name: 'search_web', input: { query: input } },
                                    { name: 'search_docs', input: { query: input } }
                                ],
                                config: {
                                    maxConcurrency: 2,
                                    failFast: false,
                                    aggregateResults: true
                                }
                            }
                        }
                    };
                }
                
                return {
                    reasoning: 'No tools needed',
                    action: { type: 'final_answer', content: 'Processed directly' }
                };
            }
        });
        
        // Execute agent
        const result = await orchestrator.callAgent('parallel-researcher', 'pesquisar agentes');
        
        // Verify results
        expect(result.success).toBe(true);
        expect(result.result).toBeDefined();
        expect(result.metadata.toolsUsed).toBeGreaterThan(0);
    });
    
    it('should handle autonomous agent decision making', async () => {
        // Test autonomous intelligence
    });
    
    it('should integrate planner and router intelligence', async () => {
        // Test planner + router + agent coordination
    });
});
```

---

### **📅 PHASE 4: POLISH & DOCS (Week 4) - 8 tarefas**

#### **📚 Examples**

**📄 `src/examples/parallel-tools-example.ts` (NOVO)**
```typescript
// STATUS: ⏳ Pendente
// PRIORIDADE: 🟡 Baixa

/**
 * Example: Agent using parallel tool execution
 */

import { createOrchestration } from '../orchestration/sdk-orchestrator.js';
import { z } from 'zod';

async function main() {
    const orchestrator = createOrchestration();
    
    // Register tools
    orchestrator.createTool({
        name: 'search_web',
        description: 'Search the web for information',
        inputSchema: z.object({ query: z.string() }),
        execute: async (input) => {
            // Simulate web search
            await new Promise(resolve => setTimeout(resolve, 1000));
            return { results: [`Web result for: ${input.query}`] };
        }
    });
    
    orchestrator.createTool({
        name: 'search_docs',
        description: 'Search internal documentation',
        inputSchema: z.object({ query: z.string() }),
        execute: async (input) => {
            // Simulate doc search
            await new Promise(resolve => setTimeout(resolve, 800));
            return { results: [`Doc result for: ${input.query}`] };
        }
    });
    
    orchestrator.createTool({
        name: 'search_code',
        description: 'Search code repositories',
        inputSchema: z.object({ query: z.string() }),
        execute: async (input) => {
            // Simulate code search
            await new Promise(resolve => setTimeout(resolve, 1200));
            return { results: [`Code result for: ${input.query}`] };
        }
    });
    
    // Create parallel research agent
    await orchestrator.createAgent({
        name: 'parallel-researcher',
        description: 'Agent that researches using multiple sources in parallel',
        think: async (input: string, context) => {
            console.log(`🔍 Research query: ${input}`);
            
            if (input.toLowerCase().includes('pesquisar') || 
                input.toLowerCase().includes('buscar')) {
                
                return {
                    reasoning: 'I will search multiple sources in parallel for faster results',
                    action: {
                        type: 'parallel_tools',
                        content: {
                            tools: [
                                { name: 'search_web', input: { query: input } },
                                { name: 'search_docs', input: { query: input } },
                                { name: 'search_code', input: { query: input } }
                            ],
                            config: {
                                maxConcurrency: 3,
                                failFast: false,
                                aggregateResults: true
                            }
                        }
                    }
                };
            }
            
            return {
                reasoning: 'No research needed for this query',
                action: {
                    type: 'final_answer',
                    content: `Direct response to: ${input}`
                }
            };
        }
    });
    
    // Test queries
    const queries = [
        'pesquisar informações sobre IA',
        'buscar documentação sobre agents',
        'como funciona o parallel execution'
    ];
    
    console.log('🚀 Starting parallel tools demonstration\n');
    
    for (const query of queries) {
        console.log(`\n📝 Query: ${query}`);
        
        const startTime = Date.now();
        const result = await orchestrator.callAgent('parallel-researcher', query);
        const duration = Date.now() - startTime;
        
        console.log(`✅ Result (${duration}ms):`, JSON.stringify(result.result, null, 2));
        console.log(`🔧 Tools used: ${result.metadata.toolsUsed}`);
    }
    
    console.log('\n🎉 Parallel tools demonstration completed!');
}

main().catch(console.error);
```

#### **📚 Documentation**

**📄 `docs/guides/parallel-tool-execution.md` (NOVO)**
```markdown
# Parallel Tool Execution Guide

## Overview

Kodus Flow supports advanced tool execution patterns including parallel, sequential, and conditional execution. This guide covers how to use these features effectively.

## Parallel Tool Execution

### Basic Usage

```typescript
await orchestrator.createAgent({
    name: 'parallel-agent',
    think: async (input: string, context) => {
        return {
            reasoning: 'Execute multiple tools simultaneously',
            action: {
                type: 'parallel_tools',
                content: {
                    tools: [
                        { name: 'tool1', input: { query: input } },
                        { name: 'tool2', input: { query: input } }
                    ],
                    config: {
                        maxConcurrency: 3,
                        failFast: false,
                        aggregateResults: true
                    }
                }
            }
        };
    }
});
```

### Configuration Options

- `maxConcurrency`: Maximum number of tools to execute simultaneously
- `failFast`: Stop execution if any tool fails
- `aggregateResults`: Combine results into a single object

### When to Use Parallel Execution

- Independent data gathering from multiple sources
- Validation checks that can run simultaneously
- Analysis tasks that don't depend on each other

## Sequential Tool Execution

### Basic Usage

```typescript
action: {
    type: 'sequential_tools',
    content: {
        tools: [
            { name: 'validate', input: data },
            { name: 'process', input: null, dependsOn: 'validate' },
            { name: 'save', input: null, dependsOn: 'process' }
        ],
        config: {
            stopOnError: true,
            passResults: true
        }
    }
}
```

### When to Use Sequential Execution

- Data processing pipelines
- Dependent operations
- Step-by-step workflows

## Autonomous Intelligence

Agents can automatically decide which execution pattern to use based on:

- Input analysis (keywords, intent)
- Available tools
- Planner suggestions
- Router hints
- Performance preferences

### Example: Smart Agent

```typescript
await orchestrator.createAgent({
    name: 'smart-agent',
    think: async (input: string, context) => {
        // Agent receives intelligence hints via context
        const hints = context.intelligence?.toolExecutionHints;
        
        if (hints?.suggestedPattern === 'parallel') {
            // Use parallel execution
        } else if (hints?.suggestedPattern === 'sequential') {
            // Use sequential execution
        }
        
        // Agent makes autonomous decision
    }
});
```

## Best Practices

1. **Use parallel execution** for independent operations
2. **Use sequential execution** for dependent operations
3. **Set appropriate concurrency limits** to avoid overwhelming systems
4. **Handle errors gracefully** with proper fallback strategies
5. **Monitor performance** and adjust strategies accordingly

## Performance Considerations

- Parallel execution reduces overall latency but increases resource usage
- Sequential execution uses fewer resources but takes longer
- Consider API rate limits when setting concurrency
- Use batching for large numbers of tools

## Error Handling

- Configure `failFast` based on your error tolerance
- Implement proper fallback strategies
- Monitor and log execution metrics
- Use DLQ for failed operations that need retry
```

---

## 🎯 **TODO SUMMARY - IMPLEMENTATION CHECKLIST**

### **📊 Progress Tracking**

| Phase | Category | Tasks | Priority | Status |
|-------|----------|-------|----------|---------|
| 1 | Core Types | 4 | 🔴 High | ⏳ Pending |
| 1 | ToolEngine | 6 | 🔴 High | ⏳ Pending |
| 1 | AgentCore | 7 | 🔴 High | ⏳ Pending |
| 1 | Orchestrator | 3 | 🔴 High | ⏳ Pending |
| 2 | Planner Intelligence | 4 | 🔴 High | ⏳ Pending |
| 2 | Router Intelligence | 4 | 🔴 High | ⏳ Pending |
| 3 | Unit Tests | 4 | 🔴 High | ⏳ Pending |
| 3 | Integration Tests | 3 | 🔴 High | ⏳ Pending |
| 4 | Streaming | 3 | 🟡 Medium | ⏳ Pending |
| 4 | Examples & Docs | 5 | 🟡 Low | ⏳ Pending |

### **🎉 Success Criteria**

After completing all tasks, Kodus Flow will have:

✅ **Modern Tool Execution Patterns** - Parallel, sequential, conditional  
✅ **Autonomous Intelligence** - Self-deciding agents  
✅ **Advanced Planning** - Strategy-aware planners  
✅ **Smart Routing** - Intelligence-driven tool strategies  
✅ **Comprehensive Testing** - Rock-solid reliability  
✅ **Developer Experience** - Great documentation and examples  

**The framework will compete with the best agent frameworks in the market!** 🚀

---

## 💾 **Recovery Context Information**

- **Current File Structure**: Maintains existing SDK architecture with Core → Engine → Orchestration layers
- **Recent Changes**: agent-types.ts updated with separated context (user/system)
- **Integration Points**: All new features integrate with existing KernelHandler, event system, and context factories
- **Backward Compatibility**: All changes are additive, no breaking changes to existing APIs
- **Testing Strategy**: Comprehensive unit and integration tests for reliability
- **Documentation**: Complete guides and examples for developer adoption

This plan provides a complete roadmap for implementing parallel tool execution with autonomous intelligence while maintaining the SDK's architectural principles and ensuring excellent developer experience.