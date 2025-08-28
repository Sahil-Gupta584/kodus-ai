// ============================================================================
// CORE STRATEGY TYPES
// ============================================================================

// Strategy Pattern Types (baseados em padrões estabelecidos)
export type ExecutionStrategy = 'react' | 'rewoo';

// ============================================================================
// AGENT TYPES (específicos para estratégias)
// ============================================================================

// Agent Action Types
export type AgentActionType =
    | 'tool_call'
    | 'final_answer'
    | 'need_more_info'
    | 'delegate_to_agent'
    | 'execute_plan';

// Agent Action (simplificado e específico)
export interface AgentAction {
    type: AgentActionType;
    toolName?: string;
    input?: Record<string, unknown>;
    content?: unknown;
    question?: string;
    agentName?: string;
    planId?: string;
    reasoning?: string;
}

// Agent Thought (simplificado e específico)
export interface AgentThought {
    reasoning: string;
    action: AgentAction;
    metadata?: {
        startTime?: number;
        endTime?: number;
        stepId?: string;
        [key: string]: unknown;
    };
}

// Action Result (simplificado e específico)
export type ActionResultType =
    | 'tool_result'
    | 'final_answer'
    | 'error'
    | 'needs_replan';

export interface ActionResult {
    type: ActionResultType;
    content?: unknown;
    error?: string;
    metadata?: {
        toolName?: string;
        arguments?: Record<string, unknown>;
        correlationId?: string;
        executionTime?: number;
        [key: string]: unknown;
    };
}

// Result Analysis (simplificado e específico)
export interface ResultAnalysis {
    isComplete: boolean;
    isSuccessful: boolean;
    shouldContinue: boolean;
    feedback: string;
    metadata?: {
        reasoning?: string;
        nextAction?: string;
        [key: string]: unknown;
    };
}

// ============================================================================
// TOOL TYPES (específicos para estratégias)
// ============================================================================

// Tool Definition (simplificado)
export interface Tool {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
    required?: string[];
    optional?: string[];
}

// Tool Call (simplificado)
export interface ToolCall {
    toolName: string;
    arguments: Record<string, unknown>;
    metadata?: {
        correlationId?: string;
        timestamp?: number;
        [key: string]: unknown;
    };
}

// ============================================================================
// EXECUTION TYPES (específicos para estratégias)
// ============================================================================

// Execution Step Types
export type ExecutionStepType =
    | 'think'
    | 'act'
    | 'observe'
    | 'plan'
    | 'execute'
    | 'synthesize';

// Execution Step (baseado em padrões estabelecidos)
export interface ExecutionStep {
    id: string;
    type: ExecutionStepType;
    thought?: AgentThought;
    action?: AgentAction;
    result?: ActionResult;
    observation?: ResultAnalysis;
    timestamp: number;
    duration?: number;
    metadata?: Record<string, unknown>;
}

// Execution Result (reutiliza padrões existentes)
export interface ExecutionResult {
    output: unknown;
    strategy: ExecutionStrategy;
    complexity: number;
    executionTime: number;
    steps: ExecutionStep[];
    success: boolean;
    error?: string;
    metadata?: {
        agentName?: string;
        sessionId?: string;
        correlationId?: string;
        toolCallsCount?: number;
        errorsCount?: number;
        [key: string]: unknown;
    };
}

// ============================================================================
// CONTEXT TYPES (específicos para estratégias)
// ============================================================================

// Agent Context (simplificado)
export interface AgentContext {
    agentName: string;
    sessionId?: string;
    correlationId?: string;
    tenantId?: string;
    thread?: {
        id: string;
        metadata?: Record<string, unknown>;
    };
    state?: {
        set: (namespace: string, key: string, value: unknown) => Promise<void>;
        persist?: (namespace: string) => Promise<void>;
    };
    conversation?: {
        addMessage: (
            role: string,
            content: string,
            metadata?: Record<string, unknown>,
        ) => Promise<void>;
    };
    stepExecution?: {
        startStep: (iteration: number) => string;
        updateStep: (stepId: string, data: Record<string, unknown>) => void;
        addToolCall: (
            stepId: string,
            toolName: string,
            input: unknown,
            result: unknown,
            duration: number,
        ) => void;
        markCompleted: (
            stepId: string,
            result: ActionResult,
            analysis: ResultAnalysis,
        ) => void;
        markFailed: (
            stepId: string,
            result: ActionResult,
            analysis: ResultAnalysis,
        ) => void;
        getAllSteps: () => ExecutionStep[];
        getExecutionSummary: () => Record<string, unknown>;
    };
    availableTools?: Tool[];
    invocationId?: string;
}

// Strategy Execution Context
export interface StrategyExecutionContext {
    input: string;
    tools: Tool[];
    agentContext: AgentContext;
    config: StrategyConfig;
    history: ExecutionStep[];
    metadata: ExecutionMetadata;
}

// ============================================================================
// PLANNING TYPES (específicos para estratégias)
// ============================================================================

// Plan Step (simplificado)
export interface PlanStep {
    id: string;
    name: string;
    type: 'tool_call' | 'llm_call' | 'conditional' | 'parallel';
    toolName?: string;
    input?: Record<string, unknown>;
    prompt?: string;
    conditions?: Record<string, unknown>;
    dependencies?: string[];
    metadata?: Record<string, unknown>;
}

// Execution Plan (simplificado)
export interface ExecutionPlan {
    id: string;
    goal: string;
    strategy: ExecutionStrategy;
    steps: PlanStep[];
    reasoning?: string;
    status: 'created' | 'executing' | 'completed' | 'failed';
    createdAt: Date;
    updatedAt: Date;
    metadata?: Record<string, unknown>;
}

// Planner Execution Context (simplificado)
export interface PlannerExecutionContext {
    input: string;
    history: ExecutionStep[];
    iterations: number;
    maxIterations: number;
    plannerMetadata: {
        agentName: string;
        correlationId: string;
        tenantId: string;
        thread: { id: string; metadata?: Record<string, unknown> };
        startTime: number;
        enhancedContext?: Record<string, unknown>;
    };
    agentContext: AgentContext;
    isComplete: boolean;
    update: () => void;
    getCurrentSituation: () => string;
    getFinalResult: () => {
        success: boolean;
        result: ActionResult;
        iterations: number;
        totalTime: number;
        thoughts: AgentThought[];
        metadata: Record<string, unknown>;
    };
    getCurrentPlan: () => ExecutionPlan | null;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

// Stop Conditions (baseado em AI SDK Vercel/VoltAgent)
export type StopCondition<TContext = any> = (context: {
    steps: ExecutionStep[];
    currentStep: ExecutionStep;
    context: TContext;
}) => Promise<boolean> | boolean;

// Strategy Configuration
export interface StrategyConfig {
    // Estratégia de execução
    executionStrategy?: ExecutionStrategy;

    // Stop conditions por estratégia
    stopConditions?: {
        react?: {
            maxTurns?: number; // Default: 10
            maxToolCalls?: number; // Default: 20
            customConditions?: StopCondition[]; // Condições customizadas
        };
        rewoo?: {
            maxPlanSteps?: number; // Default: 15
            maxToolCalls?: number; // Default: 30
            customConditions?: StopCondition[]; // Condições customizadas
        };
    };

    // Configurações gerais
    maxExecutionTime?: number; // Timeout geral
    enableReasoning?: boolean; // Mostrar reasoning
    enableStreaming?: boolean; // Streaming de steps
}

export interface ExecutionMetadata {
    strategy: ExecutionStrategy;
    complexity: number;
    startTime: number;
    endTime?: number;
    agentName?: string;
    sessionId?: string;
    correlationId?: string;
}
