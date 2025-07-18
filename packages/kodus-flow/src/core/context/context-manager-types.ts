/**
 * @file context-manager-types.ts
 * @description Types and interfaces for the unified ContextManager
 */

import type { AgentContext } from '../types/agent-types.js';
import type { PlannerExecutionContext } from '../../engine/planning/planner-factory.js';
import type { AgentExecutionOptions } from '../types/common-types.js';
import { AgentIdentity } from '../types/agent-definition.js';

// ──────────────────────────────────────────────────────────────────────────────
// 🔧 TOOL EXECUTION CONTEXT
// ──────────────────────────────────────────────────────────────────────────────

export interface ToolExecutionContext {
    toolName: string;
    agentContext: AgentContext;
    successPatterns?: Pattern[];
    recentFailures?: FailurePattern[];
    userPreferences?: UserPreferences;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🔧 CONTEXT VALUE UPDATE INTERFACE
// ──────────────────────────────────────────────────────────────────────────────

export interface ContextValueUpdate {
    type: string; // 'agent', 'user', 'tools', 'execution', etc.
    key: string; // 'identity', 'preferences', 'lastResult', etc.
    value: unknown; // the actual value
    timestamp?: number; // when it was added (auto-generated if not provided)
    metadata?: Record<string, unknown>; // extra info like source, action, etc.
}

// ──────────────────────────────────────────────────────────────────────────────
// 🎯 CORE CONTEXT MANAGER INTERFACE
// ──────────────────────────────────────────────────────────────────────────────

export interface ContextManager {
    // 🚀 Agent Context Initialization (NEW - main responsibility)
    initializeAgentContext(
        agent: { name: string; identity?: AgentIdentity },
        input: unknown,
        config: AgentExecutionOptions,
    ): Promise<AgentContext>;

    // 🔧 Dynamic Context Updates (NEW - agent communication)
    addContextValue(update: ContextValueUpdate): Promise<void>;

    // 📝 Event Collection & Versioning
    append(source: ContextSource, data: ContextData): Promise<ContextVersion>;
    observe(event: ExecutionEvent): Promise<void>;

    // 🧠 Context Building (usando o que já existe)
    buildPlannerContext(
        input: string,
        agentContext: AgentContext,
    ): Promise<PlannerExecutionContext>;

    // 🔍 Query API
    get(path: ContextPath): Promise<unknown>;
    query(filter: ContextQuery): Promise<ContextResult[]>;

    // 📊 Analysis & Learning
    getSuccessPatterns(component: string): Promise<Pattern[]>;
    getFailureAnalysis(component: string): Promise<FailurePattern[]>;
    getExecutionTrace(executionId?: string): Promise<ExecutionStep[]>;

    // 🔄 Lifecycle Management
    startExecution(
        executionId: string,
        agentContext: AgentContext,
    ): Promise<void>;
    endExecution(executionId: string, result: ExecutionResult): Promise<void>;

    // 🏥 Health & Monitoring
    health(): Promise<HealthStatus>;
    cleanup(): Promise<void>;
}

// ──────────────────────────────────────────────────────────────────────────────
// 📁 DATA SOURCES & ROUTING
// ──────────────────────────────────────────────────────────────────────────────

export type ContextSource = 'agent' | 'tool' | 'llm' | 'user' | 'system';

export interface ContextData {
    timestamp: Date;
    executionId: string;
    data: unknown;
    metadata?: {
        success?: boolean;
        retryOf?: string;
        correlatedWith?: string[];
        duration?: number;
        source?: string;
        agentName?: string;
        toolName?: string;
        eventType?: string;
        sessionId?: string;
    };
}

export interface ExecutionEvent {
    type: 'thought' | 'action' | 'observation' | 'result' | 'error';
    source: ContextSource;
    data: unknown;
    executionId: string;
    timestamp: Date;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🔄 VERSIONING & CORRELATION
// ──────────────────────────────────────────────────────────────────────────────

export interface ContextVersion {
    id: string; // "exec123_v5_tool_20250116_100230"
    executionId: string; // "exec123"
    version: number; // 5
    source: ContextSource; // "tool"
    timestamp: Date;
    data: unknown;

    // 📋 Metadata
    metadata?: {
        success?: boolean;
        retryOf?: string;
        correlatedWith?: string[];
        duration?: number;
        source?: string;
        agentName?: string;
        toolName?: string;
        eventType?: string;
        sessionId?: string;
    };

    // 💾 Storage mapping
    storage: {
        state?: {
            namespace: string;
            key: string;
        };
        session?: {
            sessionId: string;
            entryId: string;
        };
        memory?: {
            itemId: string;
            type: string;
        };
    };

    // 🔗 Version linking
    links: {
        previousVersion?: string;
        nextVersion?: string;
        relatedVersions?: string[];
        parentExecution?: string;
        retryOf?: string;
        improvedFrom?: string;
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// 🔍 QUERY SYSTEM
// ──────────────────────────────────────────────────────────────────────────────

export interface ContextPath {
    // Examples:
    // "agent.lastThought"
    // "tools.github-mcp.results[0]"
    // "user.preferences.language"
    // "session.conversation.history"
    // "memory.patterns.github_usage"
    path: string;
    version?: string; // Specific version
    executionId?: string; // Specific execution
}

export interface ContextQuery {
    source?: ContextSource[];
    executionId?: string;
    timeRange?: { from: Date; to: Date };
    success?: boolean;
    pattern?: string;
    agentName?: string;
    toolName?: string;
    limit?: number;
    offset?: number;
}

export interface ContextResult {
    version: ContextVersion;
    data: unknown;
    relevance?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🧠 ENHANCED CONTEXT TYPES
// ──────────────────────────────────────────────────────────────────────────────

export interface EnhancedPlannerExecutionContext
    extends PlannerExecutionContext {
    // 👤 Enhanced user context from memory
    userContext: {
        preferences: UserPreferences;
        patterns: UserPattern[];
        history: UserAction[];
    };

    // 📱 Enhanced session context
    sessionContext: {
        conversationHistory: ConversationEntry[];
        metadata: SessionMetadata;
        currentIntent?: string;
        language?: string;
    };

    // 💾 Enhanced working memory from state
    workingMemory: {
        executionSteps: ExecutionStep[];
        temporaryData: Record<string, unknown>;
        toolResults: ToolResult[];
        currentState: WorkingState;
    };

    // 📊 Tool usage intelligence
    toolIntelligence: {
        [toolName: string]: {
            successRate: number;
            commonParameters: Record<string, unknown>;
            userPatterns: ToolUsagePattern[];
            recentFailures: ToolFailure[];
        };
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// 📊 PATTERN ANALYSIS
// ──────────────────────────────────────────────────────────────────────────────

export interface Pattern {
    id: string;
    pattern: string;
    confidence: number;
    occurrences: number;
    basedOnVersions: string[];
    metadata: {
        component: string;
        timeframe: { from: Date; to: Date };
        context: Record<string, unknown>;
    };
}

export interface FailurePattern extends Pattern {
    failureType:
        | 'timeout'
        | 'authentication'
        | 'validation'
        | 'network'
        | 'unknown';
    resolution?: string;
    preventionStrategy?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// 📝 EXECUTION TRACKING
// ──────────────────────────────────────────────────────────────────────────────

export interface ExecutionStep {
    step: number;
    executionId: string;
    component: string;
    action: string;
    versionId: string;
    status: 'pending' | 'running' | 'success' | 'error' | 'retry';
    duration?: number;
    timestamp: Date;
    data?: unknown;
    error?: Error;
    learnings?: string[];
}

export interface ExecutionResult {
    executionId: string;
    status: 'success' | 'error' | 'timeout' | 'cancelled';
    duration: number;
    steps: ExecutionStep[];
    finalResult?: unknown;
    error?: Error;
    metrics: {
        toolsUsed: number;
        llmCalls: number;
        tokensUsed: number;
        retries: number;
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// 🔄 STORAGE STRATEGY
// ──────────────────────────────────────────────────────────────────────────────

export interface StorageRoutingStrategy {
    shouldStoreInState(source: ContextSource, data: unknown): boolean;
    shouldStoreInSession(source: ContextSource, data: unknown): boolean;
    shouldStoreInMemory(source: ContextSource, data: unknown): boolean;

    getStateNamespace(source: ContextSource, data: unknown): string;
    getStateKey(source: ContextSource, data: unknown): string;

    getMemoryType(source: ContextSource, data: unknown): string;
    getMemoryMetadata(
        source: ContextSource,
        data: unknown,
    ): Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🏥 HEALTH & MONITORING
// ──────────────────────────────────────────────────────────────────────────────

export interface HealthStatus {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: {
        session: ServiceHealth;
        state: ServiceHealth;
        memory: ServiceHealth;
    };
    metrics: {
        activeExecutions: number;
        versionsStored: number;
        memoryUsage: number;
        averageResponseTime: number;
    };
    issues?: HealthIssue[];
}

export interface ServiceHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime: number;
    errorRate: number;
    lastCheck: Date;
    details?: string;
}

export interface HealthIssue {
    service: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: Date;
    recommendation?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🎯 SUPPORTING TYPES
// ──────────────────────────────────────────────────────────────────────────────

export interface UserPreferences {
    language: string;
    timezone: string;
    outputFormat: 'json' | 'text' | 'markdown';
    verbosity: 'minimal' | 'normal' | 'detailed';
    tools: {
        preferred: string[];
        blocked: string[];
    };
}

export interface UserPattern {
    type: 'tool_usage' | 'query_pattern' | 'success_criteria';
    pattern: string;
    frequency: number;
    lastSeen: Date;
}

export interface UserAction {
    timestamp: Date;
    action: string;
    context: Record<string, unknown>;
    result?: unknown;
}

export interface ConversationEntry {
    timestamp: Date;
    input: unknown;
    output: unknown;
    agentName?: string;
    metadata?: Record<string, unknown>;
}

export interface SessionMetadata {
    language?: string;
    userPreferences?: Partial<UserPreferences>;
    currentIntent?: string;
    lastActivity: Date;
    totalInteractions: number;
}

export interface ToolUsagePattern {
    parameters: Record<string, unknown>;
    successRate: number;
    avgDuration: number;
    lastUsed: Date;
    context: Record<string, unknown>;
}

export interface ToolFailure {
    timestamp: Date;
    parameters: Record<string, unknown>;
    error: string;
    context: Record<string, unknown>;
}

export interface ToolResult {
    toolName: string;
    parameters: Record<string, unknown>;
    result: unknown;
    success: boolean;
    duration: number;
    timestamp: Date;
}

export interface WorkingState {
    currentStep: string;
    progress: number;
    nextActions: string[];
    blockers: string[];
}
