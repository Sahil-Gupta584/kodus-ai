// /**
//  * @module core/types/common-types
//  * @description Common types for the Kodus Flow SDK - Re-exports from specialized type files
//  *
//  * This file serves as the main entry point for types in the SDK. It re-exports
//  * types from specialized files following the new Definition/Context/Engine architecture.
//  * This maintains backward compatibility while providing a clean, organized type system.
//  */

// import { z } from 'zod';
// import { BaseContext, Metadata } from './base-types.js';
// import { AnyEvent } from './events.js';
// import { ToolContext } from './tool-types.js';
// import { WorkflowContext } from './workflow-types.js';
// import { AgentContext } from './agent-types.js';
// import type { ThreadId } from './base-types.js';

// // ===== CORE CONTEXT TYPES =====
// // Re-export all core context types from the consolidated base-types module
// export type {
//     // Identifiers (EntityId já vem de base-types)
//     TenantId,
//     ThreadId,
//     SessionId,
//     ExecutionId,
//     CorrelationId,
//     UserId,
//     InvocationId,
//     WorkflowId,
//     StepId,
//     AgentId,
//     ToolId,
//     EventId,
//     OperationId,
//     ParentId,
//     SnapshotId,

//     // Core context types
//     UserContext,
//     SystemContext,
//     // RuntimeContext removed - use SystemContext directly
//     BaseContext,
//     ExecutionContext,
//     OperationContext,
//     // EventContext removed - use ExecutionContext or UnifiedEventContext
//     SnapshotContext,
// } from './base-types.js';

// export {
//     // Schemas for validation
//     identifierSchemas,

//     // Factory functions
//     validateBaseContext,
// } from './base-types.js';

// // Re-export specific schemas for backwards compatibility
// export const sessionIdSchema = z.string().min(1);
// export const entityIdSchema = z.string().min(1);

// // ===== CORE BASE TYPES =====
// // Re-export all base types that other components extend (avoiding duplicates)
// export type {
//     // Status and metadata
//     ExecutionStatus,
//     Metadata,

//     // Base interfaces
//     BaseDefinition,
//     BaseExecutionResult,
//     BaseEngineConfig,
// } from './base-types.js';

// // ===== AGENT TYPES =====
// // Re-export all agent-related types (avoiding duplicates)
// export type {
//     // Agent identity (excluindo InvocationId que já vem de context-core)

//     // Agent thinking types
//     AgentActionType,
//     AgentAction,
//     FinalAnswerAction,
//     NeedMoreInfoAction,
//     ToolCallAction,
//     DelegateToAgentAction,
//     AgentThought,

//     // Agent definition and context
//     AgentDefinition,
//     AgentContext,

//     // Agent engine types
//     AgentEngineConfig,
//     AgentExecutionOptions,
//     AgentExecutionResult,

//     // Agent events
//     AgentInputEvent,
//     AgentOutputEvent,
//     AgentThinkingEvent,
// } from './agent-types.js';

// export {
//     // Schemas (excluindo invocationIdSchema que já vem de context-core)
//     agentActionTypeSchema,
//     agentDefinitionSchema,
//     agentExecutionOptionsSchema,

//     // Helper functions
//     createAgentContext,
//     validateAgentDefinition,
//     isActionType,
// } from './agent-types.js';

// // ===== TOOL TYPES =====
// // Re-export all tool-related types
// export type {
//     // Tool parameter and schema types
//     ToolParameter,

//     // Tool definition and context
//     ToolHandler,
//     ToolDefinition,
//     ToolContext,

//     // Tool engine types
//     ToolEngineConfig,
//     ToolExecutionOptions,
//     ToolExecutionResult,

//     // Tool call types
//     ToolCall,
//     ToolResult,

//     // Tool registry types
//     ToolRegistryOptions,
//     ToolCategory,
//     ToolManifest,

//     // Tool events
//     ToolCallEvent,
//     ToolResultEvent,
//     ToolErrorEvent,
// } from './tool-types.js';

// export {
//     // Schemas
//     toolIdSchema,
//     toolCallIdSchema,
//     toolParameterSchema,
//     toolDefinitionSchema,
//     toolExecutionOptionsSchema,
//     toolCallSchema,

//     // Helper functions
//     createToolContext,
//     validateToolDefinition,
//     validateToolCall,
//     defineTool,
// } from './tool-types.js';

// // ===== WORKFLOW TYPES =====
// // Re-export all workflow-related types
// export type {
//     // Workflow step types
//     StepType,
//     StepStatus,
//     WorkflowStatus,

//     // Workflow definition and context
//     StepDefinition,
//     WorkflowDefinition,
//     WorkflowContext,
//     StepContext,

//     // Workflow interface (what Kernel expects)
//     Workflow,

//     // Workflow engine types
//     WorkflowEngineConfig,
//     WorkflowExecutionOptions,
//     WorkflowExecutionResult,

//     // Workflow execution tracking
//     StepExecution,
//     WorkflowExecution,

//     // Workflow signal types
//     WorkflowSignal,
//     WorkflowTrigger,
// } from './workflow-types.js';

// export {
//     // Schemas
//     stepIdSchema,
//     workflowExecutionIdSchema,
//     stepTypeSchema,
//     stepStatusSchema,
//     workflowStatusSchema,
//     stepDefinitionSchema,
//     workflowDefinitionSchema,
//     workflowExecutionOptionsSchema,

//     // Helper functions
//     createWorkflowContext,
//     createStepContext,
//     validateWorkflowDefinition,
//     validateStepDefinition,
//     defineWorkflow,
//     defineStep,
//     createWorkflow,
// } from './workflow-types.js';

// // ===== EVENT TYPES =====
// // Re-export event system types (from existing events.ts)
// export type {
//     Event,
//     AnyEvent,
//     EventType,
//     EventDef,
//     EventPayloads,
// } from './events.js';

// export { EVENT_TYPES, createEvent } from './events.js';

// export type WorkflowEventHandler<E extends AnyEvent = AnyEvent> = (
//     event: E,
// ) => Promise<AnyEvent | void> | AnyEvent | void;

// // Re-export enhanced types for consistency
// //

// /**
//  * Persistor interface for snapshot storage
//  */
// export interface Persistor {
//     /**
//      * Save a snapshot to storage
//      * @param snap The snapshot to save
//      * @param options Options for snapshot persistence
//      */
//     append(snap: Snapshot, options?: SnapshotOptions): Promise<void>;

//     /**
//      * Load snapshots for an execution context
//      * @param xcId The execution context ID
//      */
//     load(xcId: string): AsyncIterable<Snapshot>;

//     /**
//      * Check if a snapshot exists
//      * @param hash The hash to check
//      */
//     has(hash: string): Promise<boolean>;

//     /**
//      * Load a specific snapshot by hash
//      * @param hash The hash of the snapshot to load
//      * @returns The snapshot or null if not found
//      */
//     getByHash?(hash: string): Promise<Snapshot | null>;

//     /**
//      * List all snapshot hashes for an execution context
//      * @param xcId The execution context ID
//      * @returns Array of snapshot hashes
//      */
//     listHashes?(xcId: string): Promise<string[]>;

//     /**
//      * Get storage statistics
//      * @returns Storage statistics
//      */
//     getStats?(): Promise<PersistorStats>;
// }

// /**
//  * Storage statistics for a persistor
//  */
// export interface PersistorStats {
//     /** Total number of snapshots stored */
//     snapshotCount: number;

//     /** Total storage size in bytes */
//     totalSizeBytes: number;

//     /** Average snapshot size in bytes */
//     avgSnapshotSizeBytes: number;

//     /** Percentage of snapshots that are delta compressed */
//     deltaCompressionRatio?: number;
// }

// export interface Snapshot {
//     /** Execution context ID (format: tenant:job) */
//     xcId: string;
//     /** Timestamp when snapshot was created */
//     ts: number;
//     /** Complete event history */
//     events: AnyEvent[];
//     /** Complete workflow state */
//     state: unknown;
//     /** Deterministic hash of snapshot content */
//     hash: string;
// }

// export interface DeltaSnapshot extends Snapshot {
//     /** Flag indicating this is a delta snapshot */
//     isDelta: true;
//     /** Hash of the base snapshot this delta applies to */
//     baseHash: string;
//     /** Delta for events (implementation specific) */
//     eventsDelta?: unknown;
//     /** Delta for state (implementation specific, e.g., JSON Patch) */
//     stateDelta?: unknown;
// }

// export interface SnapshotOptions {
//     includeMetadata?: boolean;
//     compression?: boolean;
//     maxSize?: number;
//     maxSnapshots?: number;
//     useDelta?: boolean;
// }

// // ===== WORKFLOW LEGACY TYPE =====
// // Backward compatibility for workflow interface

// // ===== EVENT HANDLERS =====
// // Event handler types for the SDK
// export type EventHandler<E extends AnyEvent = AnyEvent, R = AnyEvent | void> = (
//     event: E,
// ) => Promise<R> | R;

// export type HandlerReturn = AnyEvent | void | Promise<AnyEvent | void>;

// export type EventPredicate = (event: AnyEvent) => boolean;

// // ===== EVENT STREAMS =====
// // Event stream interface for reactive programming
// export interface EventStream<T extends AnyEvent = AnyEvent>
//     extends AsyncIterable<T> {
//     filter(predicate: (event: T) => boolean): EventStream<T>;
//     map<U extends AnyEvent>(mapper: (event: T) => U): EventStream<U>;
//     until(predicate: (event: T) => boolean): EventStream<T>;
//     takeUntil(predicate: (event: T) => boolean): EventStream<T>;
//     toArray(): Promise<T[]>;
//     withMiddleware(middleware: unknown): EventStream<T>;
//     debounce(delayMs: number): EventStream<T>;
//     throttle(intervalMs: number): EventStream<T>;
//     batch(size: number, timeoutMs?: number): EventStream<AnyEvent>;
//     merge(...streams: EventStream<T>[]): EventStream<T>;
//     combineLatest(...streams: EventStream<T>[]): EventStream<AnyEvent>;
// }

// // ===== LEGACY SCHEMAS =====
// // Keep existing schemas for backward compatibility
// // entityIdSchema já exportado acima

// // Note: sessionIdSchema is already exported from context-core.js above
// // export type SessionId = z.infer<typeof sessionIdSchema>; // Using SessionId from context-core

// export const contextIdSchema = z.string().min(1);
// // ContextId moved to base-types.ts (now exported as string type)

// // ===== UTILITY TYPES =====
// // Common utility types used across the SDK

// /**
//  * Result status for operations
//  */
// export type ResultStatus = 'success' | 'error' | 'pending' | 'cancelled';

// /**
//  * Generic Result type for operations
//  */
// export interface Result<T = unknown, E = Error> {
//     success: boolean;
//     data?: T;
//     error?: E;
//     status: ResultStatus;
// }

// /**
//  * Async operation result
//  */
// export type AsyncResult<T = unknown, E = Error> = Promise<Result<T, E>>;

// /**
//  * Function signature for async operations
//  */
// export type AsyncFunction<TInput = unknown, TOutput = unknown> = (
//     input: TInput,
// ) => Promise<TOutput>;

// // ===== TYPE GUARDS =====
// // Utility type guards for runtime type checking

// export function isBaseContext(obj: unknown): obj is BaseContext {
//     return (
//         typeof obj === 'object' &&
//         obj !== null &&
//         'executionId' in obj &&
//         'tenantId' in obj &&
//         'startTime' in obj &&
//         'status' in obj
//     );
// }

// export function isAgentContext(obj: unknown): obj is AgentContext {
//     return (
//         isBaseContext(obj) &&
//         'agentName' in obj &&
//         'invocationId' in obj &&
//         'stateManager' in obj &&
//         'availableTools' in obj
//     );
// }

// export function isToolContext(obj: unknown): obj is ToolContext {
//     return (
//         isBaseContext(obj) &&
//         'toolName' in obj &&
//         'callId' in obj &&
//         'parameters' in obj
//     );
// }

// export function isWorkflowContext(obj: unknown): obj is WorkflowContext {
//     return (
//         isBaseContext(obj) &&
//         'workflowName' in obj &&
//         'stateManager' in obj &&
//         'data' in obj &&
//         'currentSteps' in obj
//     );
// }

// // ===== CONFIGURATION INTERFACES =====
// // Common configuration patterns used across engines

// /**
//  * Common retry configuration
//  */
// export interface RetryConfig {
//     maxAttempts: number;
//     delayMs: number;
//     backoffMultiplier?: number;
//     maxDelayMs?: number;
// }

// /**
//  * Common timeout configuration
//  */
// export interface TimeoutConfig {
//     defaultTimeoutMs: number;
//     maxTimeoutMs?: number;
// }

// /**
//  * Common concurrency configuration
//  */
// export interface ConcurrencyConfig {
//     maxConcurrent: number;
//     queueLimit?: number;
// }

// // ===== 🚀 NEW: INTELLIGENCE TYPES =====

// /**
//  * Agent intelligence capabilities for autonomous operation
//  */
// export interface AgentIntelligence {
//     // === TOOL EXECUTION INTELLIGENCE ===
//     toolExecution: {
//         // Can analyze which tools to run in parallel
//         supportsParallelAnalysis: boolean;
//         // Can determine execution order based on dependencies
//         supportsDependencyAnalysis: boolean;
//         // Can adapt strategy based on context
//         supportsAdaptiveStrategy: boolean;
//         // Can predict resource requirements
//         supportsResourcePrediction: boolean;
//     };

//     // === DECISION MAKING INTELLIGENCE ===
//     decisionMaking: {
//         // Can make autonomous tool selection decisions
//         autonomousToolSelection: boolean;
//         // Can handle uncertainty and ambiguity
//         uncertaintyHandling: boolean;
//         // Can learn from past executions
//         experientialLearning: boolean;
//         // Can reason about trade-offs
//         tradeoffReasoning: boolean;
//     };

//     // === CONTEXT INTELLIGENCE ===
//     contextual: {
//         // Can understand user intent from context
//         intentRecognition: boolean;
//         // Can maintain conversation state
//         conversationState: boolean;
//         // Can adapt to user preferences
//         preferenceAdaptation: boolean;
//         // Can handle multi-turn interactions
//         multiTurnDialogue: boolean;
//     };

//     // === COLLABORATION INTELLIGENCE ===
//     collaboration: {
//         // Can coordinate with other agents
//         multiAgentCoordination: boolean;
//         // Can delegate tasks effectively
//         taskDelegation: boolean;
//         // Can request help when stuck
//         helpSeeking: boolean;
//         // Can share knowledge with other agents
//         knowledgeSharing: boolean;
//     };
// }

// /**
//  * Planner intelligence for strategic planning
//  */
// export interface PlannerIntelligence {
//     // === STRATEGY ANALYSIS ===
//     strategy: {
//         // Can analyze tool parallelization opportunities
//         analyzeParallelization: (
//             tools: string[],
//             context: Record<string, unknown>,
//         ) => {
//             parallelizable: string[][];
//             sequential: string[];
//             conditional: Record<string, string[]>;
//             reasoning: string;
//         };

//         // Can estimate execution complexity
//         estimateComplexity: (
//             plan: unknown,
//             context: Record<string, unknown>,
//         ) => {
//             timeEstimate: number;
//             resourceEstimate: number;
//             riskLevel: 'low' | 'medium' | 'high';
//             confidence: number;
//         };

//         // Can suggest optimizations
//         suggestOptimizations: (
//             plan: unknown,
//             context: Record<string, unknown>,
//         ) => {
//             optimizations: string[];
//             potentialSavings: number;
//             tradeoffs: string[];
//         };
//     };

//     // === ADAPTIVE CAPABILITIES ===
//     adaptive: {
//         // Can learn from execution results
//         learnFromExecution: boolean;
//         // Can adjust strategies based on performance
//         performanceAdaptation: boolean;
//         // Can handle plan failures gracefully
//         failureRecovery: boolean;
//         // Can replan when conditions change
//         dynamicReplanning: boolean;
//     };

//     // === INTELLIGENCE HINTS ===
//     hints: {
//         // Preferred execution strategies
//         preferredStrategies: string[];
//         // Performance optimizations to consider
//         optimizations: string[];
//         // Risk factors to monitor
//         riskFactors: string[];
//         // Success metrics to track
//         successMetrics: string[];
//     };
// }

// /**
//  * Router intelligence for routing decisions
//  */
// export interface RouterIntelligence {
//     // === ROUTING STRATEGY ===
//     routing: {
//         // Can determine optimal tool execution strategy
//         determineToolExecutionStrategy: (
//             tools: string[],
//             context: Record<string, unknown>,
//         ) => {
//             strategy: 'parallel' | 'sequential' | 'conditional' | 'adaptive';
//             confidence: number;
//             reasoning: string;
//             alternatives: string[];
//         };

//         // Can apply execution rules intelligently
//         applyExecutionRules: (
//             rules: unknown[],
//             context: Record<string, unknown>,
//         ) => {
//             selectedRules: unknown[];
//             reasoning: string;
//             confidence: number;
//         };

//         // Can perform heuristic analysis
//         heuristicAnalysis: (
//             input: unknown,
//             availableOptions: string[],
//             context: Record<string, unknown>,
//         ) => {
//             recommendations: Array<{
//                 option: string;
//                 score: number;
//                 reasoning: string;
//             }>;
//             confidence: number;
//         };
//     };

//     // === ADAPTIVE INTELLIGENCE ===
//     adaptive: {
//         // Can adapt routing based on performance
//         performanceBasedRouting: boolean;
//         // Can learn from routing decisions
//         routingLearning: boolean;
//         // Can handle routing failures
//         failureHandling: boolean;
//         // Can optimize routes over time
//         routeOptimization: boolean;
//     };

//     // === INTELLIGENCE METADATA ===
//     metadata: {
//         // Intelligence capabilities supported
//         capabilities: string[];
//         // Performance metrics tracked
//         metrics: string[];
//         // Learning algorithms used
//         algorithms: string[];
//         // Confidence thresholds
//         confidenceThresholds: Record<string, number>;
//     };
// }

// /**
//  * Combined intelligence capabilities for autonomous agents
//  */
// export interface CombinedIntelligence {
//     agent: AgentIntelligence;
//     planner: PlannerIntelligence;
//     router: RouterIntelligence;

//     // === INTEGRATION CAPABILITIES ===
//     integration: {
//         // Can coordinate between intelligence layers
//         crossLayerCoordination: boolean;
//         // Can share insights between components
//         insightSharing: boolean;
//         // Can resolve conflicts between intelligence layers
//         conflictResolution: boolean;
//         // Can optimize overall system performance
//         systemOptimization: boolean;
//     };

//     // === LEARNING CAPABILITIES ===
//     learning: {
//         // Can learn from multi-layer feedback
//         multiLayerLearning: boolean;
//         // Can transfer knowledge between components
//         knowledgeTransfer: boolean;
//         // Can adapt to changing environments
//         environmentalAdaptation: boolean;
//         // Can improve over time
//         continuousImprovement: boolean;
//     };
// }

// // ===== FACTORY FUNCTIONS =====
// // Common factory functions for creating contexts and configurations

// /**
//  * Create a new execution ID
//  */
// export function createExecutionId(): string {
//     return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
// }

// /**
//  * Create a new correlation ID
//  */
// export function createCorrelationId(): string {
//     return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
// }

// /**
//  * Create default metadata
//  */
// export function createDefaultMetadata(): Metadata {
//     return {
//         createdAt: Date.now(),
//         version: '1.0.0',
//     };
// }

// /**
//  * Thread configuration for conversation/workflow identification
//  * Used to identify and track execution context
//  */
// export interface Thread {
//     /** Unique thread identifier */
//     id: ThreadId;
//     /** Thread metadata (description, type, etc.) */
//     metadata: {
//         /** Thread description */
//         description?: string;
//         /** Additional metadata (string or number only to avoid large objects) */
//         [key: string]: string | number | undefined;
//     };
// }

// /**
//  * Thread metadata schema for validation
//  */
// export const threadMetadataSchema = z
//     .object({
//         description: z.string().optional(),
//         type: z
//             .enum(['user', 'organization', 'system', 'bot', 'custom'])
//             .optional(),
//     })
//     .and(z.record(z.string(), z.union([z.string(), z.number()])));

// /**
//  * Thread schema for validation
//  */
// export const threadSchema = z.object({
//     id: z.string().min(1),
//     metadata: threadMetadataSchema,
// });
