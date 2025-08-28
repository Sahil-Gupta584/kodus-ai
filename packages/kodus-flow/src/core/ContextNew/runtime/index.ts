/**
 * 🚀 CONTEXT RUNTIME INDEX
 *
 * Centralized exports for all runtime interfaces
 */

// Runtime interfaces
export type * from './context-runtime.js';

// Key runtime interfaces
export type {
    // Factory interfaces
    AgentRuntimeFactory,
    RuntimeContextOptions,
    AgentRuntimeConfig,

    // Bridge implementation
    ContextBridgeImplementation,

    // Orchestrator
    RuntimeContextOrchestrator,
    RuntimeContextRegistry,
    RuntimeMetricsCollector,

    // Configuration
    MemoryConfiguration,
    StateConfiguration,
    MemoryRetentionPolicy,

    // Analytics and insights
    ContextInsights,
    ContextReport,

    // Health and monitoring
    ContextHealthStatus,
    RuntimeHealthReport,
    ComponentHealth,
    PerformanceHealth,
    ResourceHealth,

    // Metrics
    RuntimePerformanceMetrics,
    RuntimeResourceMetrics,
    ErrorAnalytics,
    UsagePatternAnalysis,

    // Operational
    SessionInitializationOptions,
    SessionTerminationResult,
    ContextCleanupResult,
    ContextOptimizationResult,

    // Callbacks
    ContextLifecycleCallback,
    ContextStateChangeCallback,
} from './context-runtime.js';
