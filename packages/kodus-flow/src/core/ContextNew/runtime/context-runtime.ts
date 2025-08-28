/**
 * 🚀 CONTEXT RUNTIME INTERFACES
 *
 * Core runtime interfaces for agent context management
 * These are the main entry points for context operations
 */

import type {
    AgentRuntimeContext,
    ContextBridge,
    ContextValidationResult,
    ContextOperations,
} from '../types/context-types.js';

import type {
    ExecutionContext,
    EnrichedPlannerContext,
    FinalResponseContext,
    PlanExecution,
    ExecutionSummary,
} from '../types/execution-types.js';

import type {
    HierarchicalMemoryContext,
    ContextRetrievalEngine,
} from '../types/memory-types.js';

import type {
    ExecutionStateManager,
    PlanStateManager,
    CheckpointManager,
    StateTransitionManager,
    StateSnapshot,
} from '../types/state-types.js';

import {
    PlannerExecutionContext,
    ExecutionPhase,
} from '../../types/allTypes.js';

// ===============================================
// 🎯 RUNTIME FACTORY INTERFACES
// ===============================================

/**
 * Factory for creating complete agent runtime contexts
 */
export interface AgentRuntimeFactory {
    // Context creation
    createRuntimeContext(
        options: RuntimeContextOptions,
    ): Promise<AgentRuntimeContext>;
    restoreRuntimeContext(snapshotId: string): Promise<AgentRuntimeContext>;

    // Context lifecycle
    initializeContext(context: AgentRuntimeContext): Promise<void>;
    finalizeContext(context: AgentRuntimeContext): Promise<void>;

    // Context validation
    validateRuntimeEnvironment(): Promise<RuntimeValidationResult>;
}

/**
 * Runtime context creation options
 */
export interface RuntimeContextOptions {
    // Identity
    agentId: string;
    sessionId: string;
    tenantId: string;
    threadId: string;

    // Configuration
    config: AgentRuntimeConfig;

    // Initial state
    initialPhase?: ExecutionPhase;
    restoreFromSnapshot?: string;

    // Memory configuration
    memoryConfig?: MemoryConfiguration;

    // State configuration
    stateConfig?: StateConfiguration;
}

/**
 * Agent runtime configuration
 */
export interface AgentRuntimeConfig {
    // Execution settings
    maxExecutionTime?: number;
    maxPlanExecutions?: number;
    maxReplanAttempts?: number;

    // Memory settings
    memoryRetentionPolicy: MemoryRetentionPolicy;
    contextCompressionRatio?: number;

    // State management
    checkpointingEnabled: boolean;
    autoCheckpointInterval?: number;

    // Performance settings
    enableMetrics: boolean;
    enableTracing: boolean;

    // Error handling
    errorRecoveryEnabled: boolean;
    maxRecoveryAttempts?: number;
}

// ===============================================
// 🌉 CONTEXT BRIDGE IMPLEMENTATION INTERFACE
// ===============================================

/**
 * Implementation interface for the ContextBridge
 * This solves the createFinalResponse problem
 */
export interface ContextBridgeImplementation extends ContextBridge {
    // Core bridge functionality
    buildFinalResponseContext(
        plannerContext: PlannerExecutionContext,
    ): Promise<FinalResponseContext>;

    enrichPlannerContext(
        context: PlannerExecutionContext,
    ): Promise<EnrichedPlannerContext>;

    // Extended functionality
    buildExecutionSummary(
        plannerContext: PlannerExecutionContext,
    ): Promise<ExecutionSummary>;

    extractContextInsights(
        context: AgentRuntimeContext,
    ): Promise<ContextInsights>;

    generateContextReport(context: AgentRuntimeContext): Promise<ContextReport>;
}

// ===============================================
// 🎛️ RUNTIME ORCHESTRATOR INTERFACE
// ===============================================

/**
 * Main orchestrator for runtime context operations
 */
export interface RuntimeContextOrchestrator {
    // Context lifecycle management
    initializeSession(
        options: SessionInitializationOptions,
    ): Promise<AgentRuntimeContext>;
    terminateSession(sessionId: string): Promise<SessionTerminationResult>;

    // Context operations coordination
    executeWithContext<T>(
        contextId: string,
        operation: (context: AgentRuntimeContext) => Promise<T>,
    ): Promise<T>;

    // Context synchronization
    synchronizeContext(contextId: string): Promise<void>;

    // Resource management
    cleanupExpiredContexts(): Promise<ContextCleanupResult>;
    optimizeContexts(): Promise<ContextOptimizationResult>;

    // Health monitoring
    getContextHealth(contextId: string): Promise<ContextHealthStatus>;
    getAllContextsHealth(): Promise<RuntimeHealthReport>;
}

// ===============================================
// 🎯 CONTEXT REGISTRY INTERFACE
// ===============================================

/**
 * Registry for managing active contexts
 */
export interface RuntimeContextRegistry {
    // Context registration
    registerContext(context: AgentRuntimeContext): Promise<void>;
    unregisterContext(contextId: string): Promise<void>;

    // Context retrieval
    getContext(contextId: string): Promise<AgentRuntimeContext | null>;
    getAllContexts(): Promise<AgentRuntimeContext[]>;
    getContextsByAgent(agentId: string): Promise<AgentRuntimeContext[]>;
    getContextsBySession(sessionId: string): Promise<AgentRuntimeContext[]>;

    // Context queries
    findContextsByPhase(phase: ExecutionPhase): Promise<AgentRuntimeContext[]>;
    findContextsByTenant(tenantId: string): Promise<AgentRuntimeContext[]>;

    // Context statistics
    getRegistryStats(): Promise<RegistryStatistics>;

    // Context lifecycle events
    onContextCreated(callback: ContextLifecycleCallback): void;
    onContextDestroyed(callback: ContextLifecycleCallback): void;
    onContextStateChanged(callback: ContextStateChangeCallback): void;
}

// ===============================================
// 📊 RUNTIME METRICS INTERFACE
// ===============================================

/**
 * Runtime metrics collection and analysis
 */
export interface RuntimeMetricsCollector {
    // Metric collection
    recordContextCreation(contextId: string, duration: number): void;
    recordContextOperation(
        contextId: string,
        operation: string,
        duration: number,
    ): void;
    recordContextError(contextId: string, error: RuntimeError): void;

    // Performance metrics
    getPerformanceMetrics(
        contextId?: string,
    ): Promise<RuntimePerformanceMetrics>;
    getResourceUtilization(): Promise<RuntimeResourceMetrics>;

    // Error analytics
    getErrorAnalytics(timeRange?: TimeRange): Promise<ErrorAnalytics>;

    // Usage patterns
    getUsagePatterns(): Promise<UsagePatternAnalysis>;

    // Health scoring
    calculateHealthScore(contextId: string): Promise<number>;

    // Reporting
    generateMetricsReport(
        options: MetricsReportOptions,
    ): Promise<MetricsReport>;
}

// ===============================================
// 🔧 CONFIGURATION INTERFACES
// ===============================================

/**
 * Memory configuration
 */
export interface MemoryConfiguration {
    shortTermCapacity: number;
    longTermRetentionDays: number;
    episodicMemoryEnabled: boolean;
    compressionThreshold: number;
    retrievalStrategy: 'similarity' | 'temporal' | 'hybrid';
}

/**
 * State configuration
 */
export interface StateConfiguration {
    persistenceEnabled: boolean;
    checkpointFrequency: number;
    maxCheckpoints: number;
    compressionEnabled: boolean;
    encryptionEnabled: boolean;
}

/**
 * Memory retention policy
 */
export interface MemoryRetentionPolicy {
    shortTermTtl: number; // milliseconds
    longTermTtl: number; // milliseconds
    episodicTtl: number; // milliseconds
    cleanupInterval: number; // milliseconds
    maxMemoryUsage: number; // bytes
}

// ===============================================
// 📈 ANALYTICS AND INSIGHTS
// ===============================================

/**
 * Context insights
 */
export interface ContextInsights {
    // Execution patterns
    commonExecutionPatterns: ExecutionPattern[];
    performanceBottlenecks: PerformanceBottleneck[];

    // Memory analysis
    memoryUsagePatterns: MemoryUsagePattern[];
    retrievalEfficiency: RetrievalEfficiencyMetrics;

    // State analysis
    stateTransitionPatterns: StateTransitionPattern[];
    checkpointUtilization: CheckpointUtilizationMetrics;

    // Recommendations
    optimizationRecommendations: OptimizationRecommendation[];
    performanceImprovement: PerformanceImprovement[];
}

/**
 * Context report
 */
export interface ContextReport {
    // Summary
    summary: ContextSummary;

    // Detailed sections
    execution: ExecutionReport;
    memory: MemoryReport;
    state: StateReport;
    performance: PerformanceReport;

    // Analysis
    insights: ContextInsights;
    recommendations: string[];

    // Metadata
    generatedAt: number;
    reportVersion: string;
    contextVersion: string;
}

// ===============================================
// 🔄 OPERATIONAL INTERFACES
// ===============================================

/**
 * Session initialization options
 */
export interface SessionInitializationOptions {
    sessionId: string;
    agentId: string;
    tenantId: string;
    threadId: string;
    config?: Partial<AgentRuntimeConfig>;
    initialContext?: Record<string, unknown>;
}

/**
 * Session termination result
 */
export interface SessionTerminationResult {
    success: boolean;
    sessionId: string;
    finalSnapshot?: StateSnapshot;
    cleanupPerformed: boolean;
    errors?: string[];
}

/**
 * Context cleanup result
 */
export interface ContextCleanupResult {
    cleanedContexts: number;
    reclaimedMemory: number;
    removedCheckpoints: number;
    errors: string[];
}

/**
 * Context optimization result
 */
export interface ContextOptimizationResult {
    optimizedContexts: number;
    memorySaved: number;
    performanceImprovement: number;
    recommendations: string[];
}

// ===============================================
// 📊 MONITORING AND HEALTH
// ===============================================

/**
 * Context health status
 */
export interface ContextHealthStatus {
    contextId: string;
    overallHealth: 'healthy' | 'warning' | 'critical';

    // Component health
    execution: ComponentHealth;
    memory: ComponentHealth;
    state: ComponentHealth;

    // Metrics
    performance: PerformanceHealth;
    resources: ResourceHealth;

    // Issues and recommendations
    issues: HealthIssue[];
    recommendations: string[];
}

/**
 * Component health
 */
export interface ComponentHealth {
    status: 'healthy' | 'warning' | 'critical';
    metrics: Record<string, number>;
    lastCheck: number;
    issues: string[];
}

/**
 * Performance health
 */
export interface PerformanceHealth {
    averageResponseTime: number;
    throughput: number;
    errorRate: number;
    status: 'healthy' | 'warning' | 'critical';
}

/**
 * Resource health
 */
export interface ResourceHealth {
    memoryUsage: number;
    storageUsage: number;
    cpuUsage: number;
    status: 'healthy' | 'warning' | 'critical';
}

/**
 * Health issue
 */
export interface HealthIssue {
    severity: 'low' | 'medium' | 'high' | 'critical';
    component: string;
    description: string;
    recommendation: string;
    timestamp: number;
}

/**
 * Runtime health report
 */
export interface RuntimeHealthReport {
    overallHealth: 'healthy' | 'warning' | 'critical';
    totalContexts: number;
    healthyContexts: number;
    warningContexts: number;
    criticalContexts: number;

    // System health
    systemHealth: SystemHealth;

    // Issues summary
    criticalIssues: HealthIssue[];
    recommendations: string[];
}

/**
 * System health
 */
export interface SystemHealth {
    memoryHealth: ComponentHealth;
    storageHealth: ComponentHealth;
    performanceHealth: ComponentHealth;
    networkHealth: ComponentHealth;
}

// ===============================================
// 📈 METRICS AND ANALYTICS TYPES
// ===============================================

/**
 * Runtime performance metrics
 */
export interface RuntimePerformanceMetrics {
    contextOperations: OperationMetrics;
    memoryOperations: OperationMetrics;
    stateOperations: OperationMetrics;

    averageLatency: number;
    throughput: number;
    errorRate: number;
}

/**
 * Operation metrics
 */
export interface OperationMetrics {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
}

/**
 * Runtime resource metrics
 */
export interface RuntimeResourceMetrics {
    totalMemoryUsage: number;
    averageMemoryPerContext: number;
    storageUsage: number;

    contextCount: number;
    activeContexts: number;

    checkpointCount: number;
    checkpointStorage: number;
}

/**
 * Error analytics
 */
export interface ErrorAnalytics {
    totalErrors: number;
    errorsByType: Record<string, number>;
    errorsByComponent: Record<string, number>;
    errorTrends: ErrorTrend[];

    recoveryRate: number;
    averageRecoveryTime: number;
}

/**
 * Error trend
 */
export interface ErrorTrend {
    timestamp: number;
    errorCount: number;
    errorType: string;
}

/**
 * Usage pattern analysis
 */
export interface UsagePatternAnalysis {
    peakUsageHours: number[];
    averageSessionDuration: number;
    commonOperationSequences: OperationSequence[];
    resourceUtilizationTrends: ResourceTrend[];
}

/**
 * Operation sequence
 */
export interface OperationSequence {
    sequence: string[];
    frequency: number;
    averageDuration: number;
}

/**
 * Resource trend
 */
export interface ResourceTrend {
    timestamp: number;
    memoryUsage: number;
    storageUsage: number;
    contextCount: number;
}

// ===============================================
// 🎪 CALLBACK AND EVENT TYPES
// ===============================================

/**
 * Context lifecycle callback
 */
export type ContextLifecycleCallback = (context: AgentRuntimeContext) => void;

/**
 * Context state change callback
 */
export type ContextStateChangeCallback = (
    contextId: string,
    fromPhase: ExecutionPhase,
    toPhase: ExecutionPhase,
) => void;

// ===============================================
// 🏷️ SUPPORTING TYPES
// ===============================================

export interface RuntimeValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    requirements: RuntimeRequirement[];
}

export interface RuntimeRequirement {
    name: string;
    required: boolean;
    satisfied: boolean;
    description: string;
}

export interface RegistryStatistics {
    totalContexts: number;
    contextsByPhase: Record<ExecutionPhase, number>;
    contextsByAgent: Record<string, number>;
    memoryUsage: number;
    createdToday: number;
}

export interface RuntimeError {
    code: string;
    message: string;
    component: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: number;
    context?: Record<string, unknown>;
}

export interface TimeRange {
    start: number;
    end: number;
}

export interface MetricsReportOptions {
    contextId?: string;
    timeRange?: TimeRange;
    includeDetails: boolean;
    format: 'json' | 'csv' | 'pdf';
}

export interface MetricsReport {
    summary: MetricsSummary;
    details: MetricsDetail[];
    charts: ChartData[];
    recommendations: string[];
}

export interface MetricsSummary {
    totalOperations: number;
    averagePerformance: number;
    errorRate: number;
    healthScore: number;
}

export interface MetricsDetail {
    metric: string;
    value: number;
    trend: 'up' | 'down' | 'stable';
    benchmark?: number;
}

export interface ChartData {
    type: 'line' | 'bar' | 'pie';
    title: string;
    data: DataPoint[];
}

export interface DataPoint {
    x: number | string;
    y: number;
    label?: string;
}

// ===============================================
// 🎯 PATTERN AND ANALYSIS TYPES
// ===============================================

export interface ExecutionPattern {
    patternId: string;
    description: string;
    frequency: number;
    typicalDuration: number;
    successRate: number;
}

export interface PerformanceBottleneck {
    component: string;
    description: string;
    impactSeverity: 'low' | 'medium' | 'high' | 'critical';
    suggestedResolution: string;
}

export interface MemoryUsagePattern {
    patternType: string;
    averageUsage: number;
    peakUsage: number;
    growthRate: number;
}

export interface RetrievalEfficiencyMetrics {
    averageRetrievalTime: number;
    hitRate: number;
    relevanceScore: number;
    cacheEfficiency: number;
}

export interface StateTransitionPattern {
    fromPhase: ExecutionPhase;
    toPhase: ExecutionPhase;
    frequency: number;
    averageDuration: number;
    successRate: number;
}

export interface CheckpointUtilizationMetrics {
    checkpointCount: number;
    storageUsage: number;
    restorationRate: number;
    compressionRatio: number;
}

export interface OptimizationRecommendation {
    category: 'performance' | 'memory' | 'storage' | 'configuration';
    priority: 'low' | 'medium' | 'high';
    description: string;
    expectedImpact: string;
    implementationComplexity: 'low' | 'medium' | 'high';
}

export interface PerformanceImprovement {
    area: string;
    currentValue: number;
    targetValue: number;
    improvementPercent: number;
    actionRequired: string;
}

// ===============================================
// 📋 REPORT SECTIONS
// ===============================================

export interface ContextSummary {
    contextId: string;
    sessionId: string;
    agentId: string;
    currentPhase: ExecutionPhase;
    totalExecutionTime: number;
    operationsPerformed: number;
    healthScore: number;
}

export interface ExecutionReport {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
    executionPatterns: ExecutionPattern[];
}

export interface MemoryReport {
    memoryUtilization: number;
    memoryByType: Record<string, number>;
    retrievalPatterns: RetrievalPattern[];
    compressionRatio: number;
}

export interface RetrievalPattern {
    queryType: string;
    frequency: number;
    averageLatency: number;
    successRate: number;
}

export interface StateReport {
    currentState: ExecutionPhase;
    stateHistory: StateHistoryEntry[];
    checkpointCount: number;
    transitionPatterns: StateTransitionPattern[];
}

export interface StateHistoryEntry {
    phase: ExecutionPhase;
    startTime: number;
    duration: number;
    transitionReason: string;
}

export interface PerformanceReport {
    overallPerformance: PerformanceMetrics;
    bottlenecks: PerformanceBottleneck[];
    trends: PerformanceTrend[];
    recommendations: PerformanceRecommendation[];
}

export interface PerformanceMetrics {
    averageLatency: number;
    throughput: number;
    errorRate: number;
    resourceEfficiency: number;
}

export interface PerformanceTrend {
    metric: string;
    timeRange: TimeRange;
    trendDirection: 'improving' | 'degrading' | 'stable';
    changePercent: number;
}

export interface PerformanceRecommendation {
    area: string;
    recommendation: string;
    expectedImprovement: string;
    implementationEffort: 'low' | 'medium' | 'high';
}
