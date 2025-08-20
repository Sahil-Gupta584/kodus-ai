/**
 * @module observability/enhanced-schemas
 * @description Enhanced schemas para AI/LLM observability com suporte completo a cost tracking,
 * quality monitoring, e contexto de negócio
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type Environment = 'development' | 'staging' | 'production' | 'test';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type UserImpact = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type AgentPhase = 'think' | 'act' | 'observe' | 'plan' | 'reflect';
export type ToolCategory =
    | 'llm'
    | 'search'
    | 'api'
    | 'file'
    | 'database'
    | 'computation'
    | 'communication';
export type LLMProvider =
    | 'openai'
    | 'anthropic'
    | 'google'
    | 'azure'
    | 'huggingface'
    | 'local';

// ============================================================================
// BUSINESS CONTEXT
// ============================================================================

export interface BusinessContext {
    userId?: string;
    sessionId?: string;
    workflowType?: string; // 'customer-support', 'data-analysis', 'content-generation'
    department?: string; // 'sales', 'support', 'engineering', 'marketing'
    priority?: Priority;
    region?: string; // 'us-east-1', 'eu-west-1', etc.
}

// ============================================================================
// TECHNICAL CONTEXT
// ============================================================================

export interface TechnicalContext {
    serviceVersion: string;
    deploymentId: string; // Git SHA ou deployment ID
    instanceId: string; // Container/pod ID
    region?: string; // Cloud region
    environment: Environment;
    namespace?: string; // Kubernetes namespace
}

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================

export interface PerformanceMetrics {
    duration?: number; // Operation duration in ms
    memoryUsed?: number; // Memory used in bytes
    memoryPeak?: number; // Peak memory usage in bytes
    cpuTime?: number; // CPU time in ms
    ioOperations?: number; // Number of I/O operations
    cacheHits?: number; // Cache hits
    cacheMisses?: number; // Cache misses
    networkCalls?: number; // Number of network calls
    bytesIn?: number; // Bytes received
    bytesOut?: number; // Bytes sent
}

// ============================================================================
// LLM METRICS
// ============================================================================

export interface LLMMetrics {
    model: string; // 'gpt-4-turbo', 'claude-3-sonnet', etc.
    provider: LLMProvider;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number; // inputTokens + outputTokens
    cost: number; // Total cost in USD
    inputCost: number; // Input cost in USD
    outputCost: number; // Output cost in USD

    // LLM Parameters
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;

    // Prompt Engineering
    promptTemplate?: string; // Template identifier
    promptVersion?: string; // Prompt version
    promptTokens?: number; // Tokens in prompt template

    // Quality Metrics
    responseQuality?: number; // 0-1 quality score
    relevanceScore?: number; // 0-1 relevance score
    hallucinationRisk?: number; // 0-1 hallucination risk score
    coherenceScore?: number; // 0-1 coherence score

    // Response Characteristics
    responseLength?: number; // Response length in characters
    sentenceCount?: number; // Number of sentences
    complexityScore?: number; // Text complexity score

    // Performance
    latency?: number; // Response latency in ms
    retryCount?: number; // Number of retries
    cached?: boolean; // Whether response was cached
}

// ============================================================================
// AGENT METRICS
// ============================================================================

export interface AgentMetrics {
    name: string;
    version?: string;
    phase?: AgentPhase;
    iteration?: number; // Current iteration in ReAct loop
    maxIterations?: number; // Maximum allowed iterations
    confidence?: number; // 0-1 confidence score
    reasoning?: string; // Agent's reasoning (truncated)

    // Decision Making
    planningTime?: number; // Time spent planning in ms
    executionTime?: number; // Time spent executing in ms
    reflectionTime?: number; // Time spent reflecting in ms

    // Context
    contextSize?: number; // Size of agent context
    memoryUsed?: number; // Memory used by agent
    toolsAvailable?: number; // Number of available tools
    toolsUsed?: number; // Number of tools actually used

    // Quality
    taskSuccess?: boolean; // Whether task was completed successfully
    userSatisfaction?: number; // 0-1 user satisfaction score
    goalAchievement?: number; // 0-1 goal achievement score
}

// ============================================================================
// TOOL METRICS
// ============================================================================

export interface ToolMetrics {
    name: string;
    version?: string;
    category?: ToolCategory;

    // Input/Output
    inputSize?: number; // Input data size in bytes
    outputSize?: number; // Output data size in bytes
    inputSchema?: string; // Input schema validation
    outputSchema?: string; // Output schema validation

    // Performance
    executionTime?: number; // Tool execution time in ms
    timeoutMs?: number; // Tool timeout setting
    retryCount?: number; // Number of retries
    maxRetries?: number; // Maximum retry limit

    // Success Metrics
    success?: boolean; // Whether tool execution succeeded
    errorCode?: string; // Error code if failed
    reliability?: number; // 0-1 reliability score

    // Usage
    invocationCount?: number; // How many times tool was called
    cacheHitRate?: number; // Cache hit rate for this tool
}

// ============================================================================
// SYSTEM METRICS
// ============================================================================

export interface SystemMetrics {
    // Memory Stats
    memoryStats?: {
        heapUsedMb: number;
        heapTotalMb: number;
        heapAvailableMb: number;
        rssMb: number;
        externalMb: number;
        heapUsagePercent: number;
        gcCount?: number; // Garbage collection count
        gcTime?: number; // Time spent in GC
    };

    // CPU Stats
    cpuStats?: {
        usage: number; // CPU usage percentage
        loadAverage: number[]; // Load average [1m, 5m, 15m]
        userTime?: number; // User CPU time
        systemTime?: number; // System CPU time
    };

    // Network Stats
    networkStats?: {
        bytesIn: number;
        bytesOut: number;
        requestsPerSec: number;
        connectionsActive: number;
        connectionsIdle: number;
    };

    // Disk Stats
    diskStats?: {
        bytesRead: number;
        bytesWritten: number;
        iopsRead: number;
        iopsWrite: number;
        diskUsagePercent: number;
    };
}

// ============================================================================
// QUALITY METRICS
// ============================================================================

export interface QualityMetrics {
    // Response Quality
    responseRelevance?: number; // 0-1 semantic relevance to query
    responseCoherence?: number; // 0-1 logical consistency
    responseCompleteness?: number; // 0-1 completeness of answer
    responseAccuracy?: number; // 0-1 factual accuracy

    // Risk Assessment
    hallucinationRisk?: number; // 0-1 hallucination risk
    biasScore?: number; // 0-1 bias detection score
    toxicityScore?: number; // 0-1 toxicity score
    safetyScore?: number; // 0-1 safety score

    // User Experience
    userSatisfaction?: number; // 0-1 user satisfaction
    taskCompletion?: number; // 0-1 task completion rate
    userEngagement?: number; // 0-1 user engagement score

    // Business Metrics
    conversionRate?: number; // Business conversion rate
    retentionImpact?: number; // Impact on user retention
    revenueImpact?: number; // Revenue impact in USD
}

// ============================================================================
// ERROR CONTEXT
// ============================================================================

export interface ErrorContext {
    errorCode?: string; // Standardized error code
    errorCategory?: string; // 'llm_timeout', 'tool_failure', 'validation_error'
    stackTrace?: string; // Full stack trace
    contextData?: Record<string, unknown>; // Additional error context
    userImpact?: UserImpact; // Impact on user experience
    resolution?: string; // How error was resolved

    // Error Classification
    isRetryable?: boolean; // Whether error can be retried
    isUserError?: boolean; // Whether error was caused by user input
    isSystemError?: boolean; // Whether error was system-related

    // Recovery
    recoveryAction?: string; // Action taken to recover
    recoveryTime?: number; // Time to recover in ms
    fallbackUsed?: boolean; // Whether fallback was used
}

// ============================================================================
// ENHANCED TELEMETRY ITEM
// ============================================================================

export interface EnhancedTelemetryItem {
    // Core identification
    _id?: string;
    timestamp: Date;
    name: string;
    duration: number;

    // Distributed tracing
    correlationId?: string;
    tenantId?: string;
    executionId: string; // ✅ Never null - populated by SessionService
    sessionId?: string; // ✅ NEW: Link to session for proper hierarchy
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;

    // Business & Technical Context
    businessContext?: BusinessContext;
    technicalContext: TechnicalContext;

    // AI/LLM specific fields
    agentMetrics?: AgentMetrics;
    toolMetrics?: ToolMetrics;
    llmMetrics?: LLMMetrics;

    // Performance & Quality
    performance?: PerformanceMetrics;
    qualityMetrics?: QualityMetrics;

    // System state
    systemMetrics?: SystemMetrics;

    // Enhanced attributes
    attributes: Record<string, string | number | boolean>;

    // Status & Error handling
    status: 'ok' | 'error' | 'timeout' | 'cancelled';
    error?: {
        name: string;
        message: string;
        stack?: string;
        code?: string;
        category?: string;
        context?: ErrorContext;
    };

    // Metadata
    createdAt: Date;
    version?: string; // Schema version for evolution
}

// ============================================================================
// ENHANCED LOG ITEM
// ============================================================================

export interface EnhancedLogItem {
    // Core identification
    _id?: string;
    timestamp: Date;
    level: LogLevel;
    message: string;
    component: string;

    // Distributed tracing
    correlationId?: string;
    tenantId?: string;
    executionId?: string; // ✅ Always populated by SessionService
    sessionId?: string; // ✅ NEW: Link to session for proper hierarchy
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;

    // Business & Technical Context
    businessContext?: BusinessContext;
    technicalContext?: TechnicalContext;

    // Structured metadata
    metadata: {
        // Operation context
        operation?: string; // 'agent_execute', 'tool_call', 'llm_request'
        operationId?: string; // Unique operation identifier

        // Performance data
        performance?: PerformanceMetrics;

        // AI-specific metadata
        agent?: AgentMetrics;
        tool?: ToolMetrics;
        llm?: LLMMetrics;

        // System metrics
        system?: SystemMetrics;

        // Quality metrics
        quality?: QualityMetrics;

        // Error context (when level = error)
        error?: ErrorContext;

        // Custom metadata (flexible)
        custom?: Record<string, unknown>;
    };

    // Error details
    error?: {
        name: string;
        message: string;
        stack?: string;
        code?: string;
        category?: string;
    };

    // Metadata
    createdAt: Date;
    version?: string; // Schema version
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface ModelPricing {
    model: string;
    provider: LLMProvider;
    inputCostPer1K: number; // Cost per 1K input tokens
    outputCostPer1K: number; // Cost per 1K output tokens
    contextWindow: number; // Maximum context window
    lastUpdated: Date;
}

export interface SchemaVersion {
    version: string;
    description: string;
    migrationRequired: boolean;
    compatibleVersions: string[];
}

export interface AIMetricsSummary {
    totalCost: number;
    totalTokens: number;
    totalRequests: number;
    avgQuality: number;
    avgLatency: number;
    errorRate: number;
}

// ============================================================================
// EXPORT ALL
// ============================================================================

export * from './mongodb-exporter.js';
