import { PlannerExecutionContext } from '../../types/allTypes.js';

// ===============================================
// 🎯 RUNTIME CONTEXT (What agent needs NOW)
// ===============================================

/**
 * Runtime context - lightweight, fast access for agent decisions
 */
export interface AgentRuntimeContext {
    // Identity
    sessionId: string;
    executionId: string;
    userId: string;
    timestamp: string; // ISO string for easy debugging

    // Current state for decisions
    state: {
        phase: 'planning' | 'execution' | 'completed' | 'error';
        lastUserIntent: string; // "create-kody-rule-and-notion", "validate-pr", etc
        pendingActions: string[]; // Actions that need to be completed
        currentStep?: string; // Current step being executed
    };

    // Essential conversation (last 6 messages max)
    messages: ChatMessage[];

    // Entities for reference resolution (framework agnostic)
    entities: Record<string, EntityRef[] | Record<string, object>>;

    // Current execution state (minimal)
    execution: {
        planId?: string;
        status?: 'in_progress' | 'success' | 'error' | 'partial';
        completedSteps: string[];
        failedSteps: string[];
        skippedSteps?: string[]; // Para compatibilidade com LLM schema
        currentTool?: string;
        lastError?: string;
        replanCount?: number;
        currentStep?: {
            id: string;
            status:
                | 'pending'
                | 'executing'
                | 'completed'
                | 'failed'
                | 'skipped';
            toolCall?: {
                name: string;
                arguments: string; // JSON string
                result?: Record<string, object>;
            };
        };
    };

    // Available tools/connections (RUNTIME ONLY - not persisted)
    availableTools: string[]; // ["KODUS_CREATE_KODY_RULE", "NOTION_SEARCH_NOTION_PAGE"] - rebuilt from ToolEngine
    activeConnections: Record<string, ConnectionStatus>; // Connection status - rebuilt on recovery
}

/**
 * OpenAI-compatible message format
 */
export interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: number;

    // For tool calls/responses
    toolCalls?: ToolCall[];
    toolCallId?: string;
    name?: string; // For tool responses
}

/**
 * Tool call following OpenAI format
 */
export interface ToolCall {
    id: string;
    name: string;
    arguments: string; // JSON string
}

/**
 * Entity reference for context resolution
 */
export interface EntityRef {
    id: string;
    title?: string;
    type?: string;
    lastUsed?: number;
}

/**
 * Connection status for MCP tools
 */
export interface ConnectionStatus {
    connected: boolean;
    lastUsed?: number;
    error?: string;
}

// ===============================================
// 🎯 LLM PLAN COMPATIBILITY (Direct mapping)
// ===============================================

/**
 * Plan step - compatível 100% com seu planStepSchema
 */
export interface PlanStep {
    id: string;
    description: string;
    status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
    toolCall?: {
        name: string;
        arguments: string; // JSON string
        result?: Record<string, object>;
    };
    error?: string;
    dependencies?: string[];
}

/**
 * Planning result - compatível 100% com seu planningResultSchema
 */
export interface PlanningResult {
    goal: string;
    plan: PlanStep[];
    reasoning?: string;
    confidence?: number;
    estimatedDuration?: number;
}

/**
 * Utility para converter entre formatos
 */
export interface PlanExecutionBridge {
    /**
     * Converte planning result do LLM para runtime context
     */
    applyPlanToContext(
        context: AgentRuntimeContext,
        planResult: PlanningResult,
    ): AgentRuntimeContext;

    /**
     * Extrai execution status para o LLM
     */
    extractExecutionStatus(context: AgentRuntimeContext): {
        completedSteps: PlanStep[];
        failedSteps: PlanStep[];
        currentStep?: PlanStep;
        nextSteps: PlanStep[];
    };
}

// ===============================================
// 🗄️ EXECUTION SNAPSHOT (For persistence & recovery)
// ===============================================

/**
 * Execution snapshot - saved to MongoDB for recovery/audit
 */
export interface ExecutionSnapshot {
    // Identity
    sessionId: string;
    executionId: string;
    timestamp: string;

    // Outcome
    outcome: 'success' | 'error' | 'partial';

    // Plan that was executed
    plan: {
        goal: string;
        steps: string[];
    };

    // Results of each step
    results: Record<string, StepResult>;

    // Error details (if any)
    error?: {
        step: string;
        message: string;
        recoverable: boolean;
        toolCall?: string;
    };

    // Context needed for recovery
    recoveryContext?: {
        entities: Record<string, EntityRef[]>;
        assumptions: string[];
        nextAction: string;
        userIntent: string;
    };
}

/**
 * Result of a single step
 */
export interface StepResult {
    status: 'success' | 'error';
    output?: Record<string, object>;
    error?: string;
    duration?: number;
    toolCall?: {
        tool: string;
        method: string;
        params: Record<string, object>;
        result: Record<string, object>;
    };
}

// ===============================================
// 🌉 CONTEXT BRIDGE (Solves createFinalResponse)
// ===============================================

/**
 * Bridge to build complete context for createFinalResponse
 */
export interface ContextBridgeService {
    /**
     * THE CORE METHOD - Builds complete context for createFinalResponse
     */
    buildFinalResponseContext(
        plannerContext: PlannerExecutionContext,
    ): Promise<FinalResponseContext>;

    /**
     * Gets current runtime context
     */
    getRuntimeContext(sessionId: string): Promise<AgentRuntimeContext>;

    /**
     * Updates runtime context with new information
     */
    updateRuntimeContext(
        sessionId: string,
        updates: Partial<AgentRuntimeContext>,
    ): Promise<void>;
}

/**
 * Complete context for createFinalResponse (solves the original problem!)
 */
export interface FinalResponseContext {
    // Current runtime context
    runtime: AgentRuntimeContext;

    // Recent execution summary
    executionSummary: {
        totalExecutions: number;
        successfulExecutions: number;
        failedExecutions: number;
        successRate: number; // 0-100
        averageExecutionTime: number;
        replanCount: number;
    };

    // Recovery information (if session was recovered)
    recovery?: {
        wasRecovered: boolean;
        gapDuration: number; // milliseconds
        recoveredFrom: string; // checkpoint, snapshot, etc
        confidence: number; // 0-1 how confident we are in the recovery
    };

    // Inferences made during recovery
    inferences?: Record<string, string>; // "esse card" -> "PROJ-123"
}

// ===============================================
// 🔧 SESSION MANAGEMENT
// ===============================================

/**
 * Session management service interface
 */
export interface SessionManager {
    /**
     * Get or create session
     */
    getOrCreateSession(
        sessionId: string,
        userId: string,
    ): Promise<AgentRuntimeContext>;

    /**
     * Update conversation with new message
     */
    addMessage(sessionId: string, message: ChatMessage): Promise<void>;

    /**
     * Add discovered entities to context
     */
    addEntities(
        sessionId: string,
        entities: Partial<AgentRuntimeContext['entities']>,
    ): Promise<void>;

    /**
     * Update execution state
     */
    updateExecution(
        sessionId: string,
        execution: Partial<AgentRuntimeContext['execution']>,
    ): Promise<void>;

    /**
     * Save execution snapshot (for recovery)
     */
    saveSnapshot(sessionId: string, snapshot: ExecutionSnapshot): Promise<void>;

    /**
     * Recover session from snapshots (handles gaps)
     */
    recoverSession(sessionId: string): Promise<{
        context: AgentRuntimeContext;
        wasRecovered: boolean;
        gapDuration: number;
        inferences: Record<string, string>;
    }>;
}

// ===============================================
// 🎛️ UTILITY TYPES
// ===============================================

/**
 * Context update operations
 */
export type ContextUpdate = {
    type: 'message' | 'entity' | 'execution' | 'state';
    data: any;
    timestamp: number;
};

/**
 * Entity resolution for references like "esse card"
 */
export interface EntityResolver {
    resolveReference(
        reference: string,
        context: AgentRuntimeContext,
    ): string | null;
    inferEntitiesFromMessage(
        message: string,
    ): Partial<AgentRuntimeContext['entities']>;
}

/**
 * Intent inference from user messages
 */
export interface IntentInference {
    inferIntent(message: string, context?: AgentRuntimeContext): string;
    getIntentConfidence(intent: string, message: string): number;
}

/**
 * Session recovery strategies
 */
export type RecoveryStrategy =
    | 'memory-based'
    | 'snapshot-based'
    | 'entity-inference'
    | 'conversation-analysis';

/**
 * Context health check
 */
export interface ContextHealth {
    healthy: boolean;
    issues: string[];
    warnings: string[];
    recommendations: string[];
}

// ===============================================
// 🏷️ TYPE GUARDS & VALIDATORS
// ===============================================

export function isValidRuntimeContext(obj: any): obj is AgentRuntimeContext {
    return (
        obj &&
        typeof obj.sessionId === 'string' &&
        typeof obj.executionId === 'string' &&
        obj.state &&
        Array.isArray(obj.messages) &&
        obj.execution &&
        Array.isArray(obj.availableTools)
    );
}

export function isValidChatMessage(obj: any): obj is ChatMessage {
    return (
        obj &&
        ['user', 'assistant', 'system', 'tool'].includes(obj.role) &&
        typeof obj.content === 'string' &&
        typeof obj.timestamp === 'number'
    );
}

export function isRecoveryNeeded(
    lastActivity: number,
    threshold: number = 300000,
): boolean {
    return Date.now() - lastActivity > threshold; // 5 minutes default
}
