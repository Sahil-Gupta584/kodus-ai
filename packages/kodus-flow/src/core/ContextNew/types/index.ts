/**
 * 📋 CONTEXT TYPES INDEX
 *
 * Centralized exports for all context type definitions
 */

// Core context types
export type * from './context-types.js';
export type * from './execution-types.js';
export type * from './memory-types.js';
export type * from './state-types.js';

// Re-export key interfaces for convenience
export type {
    // Master context interface
    AgentRuntimeContext,
    ContextBridge,
    ContextValidationResult,
    ContextOperations,

    // Context operations
    ContextMemoryOperations,
    ContextStateOperations,
    ContextExecutionOperations,
    ContextAnalysisOperations,
    ContextPersistenceOperations,

    // Memory types
    MemoryType,
    MemoryItem,
    MemoryResult,
    MemoryRetrievalOptions,
    SelectedContext,
    CompressedContext,
} from './context-types.js';

export type {
    // Core execution types
    ExecutionContext,
    FinalResponseContext,
    EnrichedPlannerContext,
    PlanExecution,
    StepExecutionRegistry,
    ExecutionSummary,
    DetailedExecutionSummary,

    // Analysis types
    FailureAnalysis,
    ReplanContext,
    ExecutionRecoveryContext,

    // Event and metadata
    ExecutionEvent,
    ExecutionMetadata,
    RuntimeMetadata,
} from './execution-types.js';

export type {
    // Memory hierarchy
    HierarchicalMemoryContext,
    ShortTermMemory,
    LongTermMemory,
    EpisodicMemory,

    // Memory engines
    ContextRetrievalEngine,
    MemoryCompressionEngine,
    MemoryIndexingEngine,
    MemoryRetentionManager,

    // Memory data structures
    MemoryNode,
    MemoryCluster,
    ConversationMemory,
    TaskMemory,
} from './memory-types.js';

export type {
    // State managers
    ExecutionStateManager,
    PlanStateManager,
    CheckpointManager,
    StateTransitionManager,

    // State data
    StateSnapshot,
    ActivePlanState,
    PlanStep,
    PlanProgress,
    PlanMetrics,

    // State enums
    PlanStatus,
    StepStatus,
    PlanStepType,
    CheckpointTrigger,
} from './state-types.js';
