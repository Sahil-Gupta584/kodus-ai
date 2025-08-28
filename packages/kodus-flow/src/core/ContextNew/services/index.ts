/**
 * 🔧 CONTEXT SERVICES INDEX
 *
 * Centralized exports for all context service interfaces
 */

// Service interfaces
export type * from './context-bridge.js';
export type * from './memory-service.js';
export type * from './execution-service.js';

// Key service interfaces
export type {
    // Context bridge services
    ContextBridgeService,
    ExecutionContextAggregate,
    RelevantMemoryContext,
    StateContextSummary,

    // Execution context aggregation
    StepExecutionStatus,
    ExecutionStepDetail,
    PlanHistoryEntry,
    SuccessPattern,
    ExecutionMetrics,

    // Memory context
    MemoryItem,
    ConversationContext,
    LearnedPattern,
    EpisodicMemoryItem,
    MemorySelectionCriteria,
    ContextCompressionInfo,
} from './context-bridge.js';

export type {
    // Memory services
    MemoryService,
    ShortTermMemoryService,
    LongTermMemoryService,
    EpisodicMemoryService,
    MemoryRetrievalService,
    MemoryCompressionService,
    MemoryIndexingService,
    MemoryRetentionService,
    MemoryAnalyticsService,

    // Memory configuration
    MemoryServiceConfig,
    RetrievalOptions,
    MemoryUtilization,
    MemoryHealthReport,

    // Knowledge management
    KnowledgeBase,
    KnowledgeGraph,
    Concept,
    Episode,
} from './memory-service.js';

export type {
    // Execution services
    ExecutionService,
    PlanExecutionService,
    StepExecutionService,
    ExecutionTrackingService,
    ExecutionAnalyticsService,

    // Execution management
    ExecutionPlan,
    ExecutionStep,
    PlanExecutionHandle,
    ExecutionStatus,
    ExecutionStepInfo,
    PlanProgress,

    // Execution configuration
    ExecutionServiceConfig,
    PlanConfiguration,
    PlanConstraints,

    // Execution results
    StepExecutionResult,
    ExecutionHealthReport,
    ExecutionDiagnosis,
    ExecutionTimeline,
} from './execution-service.js';
