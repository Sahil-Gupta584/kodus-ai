/**
 * @module core/types/workflow-types
 * @description Workflow types following Definition/Context/Engine pattern
 *
 * This file contains all workflow-related types with proper separation:
 * - WorkflowDefinition: Blueprint/configuration for a workflow
 * - WorkflowContext: Execution environment with stateful capabilities
 * - WorkflowEngine: Executor that manages workflow execution
 */

import { z } from 'zod';
import type {
    BaseContext,
    BaseDefinition,
    BaseExecutionResult,
    BaseEngineConfig,
    Metadata,
} from './base-types.js';

import { ContextStateService } from '../context/services/state-service.js';
// import { MemoryService } from '../context/context-factory.js';
import { Persistor, EventStream, Event } from './common-types.js';
import { IdGenerator } from '../../utils/id-generator.js';

// ===== WORKFLOW IDENTITY TYPES =====

/**
 * Workflow ID - identifies a specific workflow definition
 */
export const workflowIdSchema = z.string().min(1);
// WorkflowId moved to base-types.ts

/**
 * Step ID - identifies a specific step in a workflow
 */
export const stepIdSchema = z.string().min(1);
// StepId moved to base-types.ts

/**
 * Execution ID for workflow instances
 */
export const workflowExecutionIdSchema = z.string().min(1);
// WorkflowExecutionId moved to base-types.ts

// ===== WORKFLOW STEP TYPES =====

/**
 * Step type - defines what kind of step this is
 */
export const stepTypeSchema = z.enum([
    'task',
    'agent',
    'tool',
    'condition',
    'parallel',
    'sequence',
    'wait',
    'human',
    'workflow', // For sub-workflows
    'custom',
]);
export type StepType = z.infer<typeof stepTypeSchema>;

/**
 * Step status - tracks execution state of a step
 */
export const stepStatusSchema = z.enum([
    'pending',
    'running',
    'completed',
    'failed',
    'skipped',
    'canceled',
    'waiting',
]);
export type StepStatus = z.infer<typeof stepStatusSchema>;

/**
 * Workflow status - tracks execution state of the entire workflow
 */
export const workflowStatusSchema = z.enum([
    'pending',
    'running',
    'completed',
    'failed',
    'paused',
    'canceled',
]);
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;

// ===== STEP DEFINITION =====

/**
 * Step Definition - Blueprint for a workflow step
 */
export interface StepDefinition {
    id?: string;
    name: string;
    description?: string;
    type: StepType;

    // Step configuration
    config?: Record<string, unknown>;

    // Input/Output mappings
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;

    // Flow control
    next?: string | string[] | Record<string, string>; // Conditional routing
    condition?: (data: Record<string, unknown>) => boolean | Promise<boolean>;

    // Retry configuration
    retry?: {
        maxAttempts: number;
        delayMs: number;
        backoffMultiplier?: number;
        maxDelayMs?: number;
    };

    // Timeout for step execution
    timeout?: number;

    metadata?: Metadata;
}

// ===== WORKFLOW DEFINITION =====

/**
 * Workflow Definition - Blueprint for a workflow
 * This is the "what" - defines what the workflow is and can do
 */
export interface WorkflowDefinition extends BaseDefinition {
    // Workflow structure
    steps: Record<string, StepDefinition>;
    entryPoints: string[]; // Step IDs where workflow can start

    // Workflow configuration
    config?: {
        timeout?: number;
        maxConcurrency?: number;
        enableStateTracking?: boolean;
        enableRetry?: boolean;
    };

    // Workflow triggers
    triggers?: Array<{
        type: string;
        config?: Record<string, unknown>;
    }>;

    // Workflow signals for external communication
    signals?: Array<{
        name: string;
        description?: string;
        schema?: Record<string, unknown>;
    }>;

    // Dependencies on other workflows
    dependencies?: string[];
}

// ===== WORKFLOW CONTEXT =====

/**
 * Workflow Context - Execution environment for workflows
 * Extends BaseContext with stateful capabilities (memory, persistence, state tracking)
 */
export interface WorkflowContext extends BaseContext {
    // === WORKFLOW IDENTITY ===
    workflowName: string;
    executionId: string;

    // === STATEFUL CAPABILITIES ===
    // Memory service for learning and context retention
    // memoryService?: MemoryService;

    // Persistence service for data storage
    persistorService?: Persistor;

    // State management for execution state
    stateManager: ContextStateService;

    // === WORKFLOW STATE ===
    // Current workflow data/variables
    data: Record<string, unknown>;

    // Step execution tracking
    currentSteps: string[];
    completedSteps: string[];
    failedSteps: string[];

    // Workflow inputs and outputs
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;

    // === EXECUTION CONTROL ===
    // Abort signal for cancellation
    signal: AbortSignal;

    // Pause/resume capabilities
    isPaused: boolean;

    // === RUNTIME CAPABILITIES ===
    // Event stream for runtime communication
    stream?: EventStream<Event>;
    sendEvent?: (event: Event) => Promise<void>;
    emit?: (event: Event) => void;

    // Resource management
    resourceManager?: {
        addTimer: (timer: NodeJS.Timeout) => void;
        addInterval: (interval: NodeJS.Timeout) => void;
        addCleanupCallback: (callback: () => void | Promise<void>) => void;
        removeTimer: (timer: NodeJS.Timeout) => boolean;
        removeInterval: (interval: NodeJS.Timeout) => boolean;
        removeCleanupCallback: (
            callback: () => void | Promise<void>,
        ) => boolean;
    };

    // Workflow control
    pause?: (reason?: string) => Promise<string>;
    resume?: (snapshotId?: string) => Promise<void>;

    // === OBSERVABILITY ===
    // Logger instance
    logger?: {
        debug: (message: string, meta?: Record<string, unknown>) => void;
        info: (message: string, meta?: Record<string, unknown>) => void;
        warn: (message: string, meta?: Record<string, unknown>) => void;
        error: (
            message: string,
            error?: Error,
            meta?: Record<string, unknown>,
        ) => void;
    };

    // === CLEANUP ===
    cleanup(): Promise<void>;
}

// ===== STEP CONTEXT =====

/**
 * Step Context - Execution environment for individual workflow steps
 * Contains step-specific information within a workflow execution
 */
export interface StepContext extends BaseContext {
    // === STEP IDENTITY ===
    stepId: string;
    stepName: string;
    stepType: StepType;

    // === WORKFLOW REFERENCE ===
    workflowContext: WorkflowContext;

    // === STEP STATE ===
    // Step inputs/outputs
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;

    // Step attempt tracking
    attempt: number;
    maxAttempts: number;

    // === EXECUTION CONTROL ===
    signal: AbortSignal;

    // === CLEANUP ===
    cleanup(): Promise<void>;
}

// ===== WORKFLOW ENGINE TYPES =====

/**
 * Workflow Engine Configuration
 */
export interface WorkflowEngineConfig extends BaseEngineConfig {
    // Workflow execution settings
    validateDefinitions?: boolean;
    maxConcurrentExecutions?: number;
    defaultTimeoutMs?: number;

    // State management
    storage?: {
        type: 'memory' | 'redis' | 'custom';
        config?: Record<string, unknown>;
    };

    // Step execution
    maxStepRetries?: number;
    defaultStepTimeout?: number;
}

/**
 * Workflow Execution Options
 */
export interface WorkflowExecutionOptions {
    inputs?: Record<string, unknown>;
    metadata?: Metadata;
    timeout?: number;
    maxConcurrency?: number;
    enableStateTracking?: boolean;
    context?: Partial<WorkflowContext>;
}

/**
 * Workflow Execution Result
 */
export interface WorkflowExecutionResult<TOutput = unknown>
    extends BaseExecutionResult<TOutput> {
    // Workflow-specific information
    workflowName: string;
    workflowExecutionId: string;

    // Execution details
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;

    // Enhanced metadata for workflows
    metadata: Metadata & {
        executionTime: number;
        stepsExecuted: string[];
        stepsSkipped: string[];
        retryCount: number;
    };
}

// ===== STEP EXECUTION TYPES =====

/**
 * Step Execution - represents execution of a single step
 */
export interface StepExecution {
    id: string;
    stepId: string;
    executionId: string;
    status: StepStatus;

    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    error?: string;

    startTime?: number;
    endTime?: number;
    duration?: number;
    attempt?: number;

    metadata?: Metadata;
}

// ===== WORKFLOW EXECUTION TRACKING =====

/**
 * Workflow Execution - represents execution of an entire workflow
 */
export interface WorkflowExecution {
    id: string;
    workflowId: string;
    status: WorkflowStatus;

    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    error?: string;

    // Step tracking
    currentSteps?: string[];
    completedSteps?: string[];
    failedSteps?: string[];

    startTime?: number;
    endTime?: number;
    duration?: number;

    metadata?: Metadata;
}

// ===== SIGNAL TYPES =====

/**
 * Workflow Signal - external events sent to workflows
 */
export interface WorkflowSignal {
    name: string;
    payload: unknown;
    executionId: string;
    timestamp: number;
    metadata?: Metadata;
}

/**
 * Trigger - event that can start a workflow
 */
export interface WorkflowTrigger {
    id: string;
    type: string;
    workflowId: string;
    config?: Record<string, unknown>;
    metadata?: Metadata;
}

// ===== VALIDATION SCHEMAS =====

export const stepDefinitionSchema = z.object({
    id: stepIdSchema.optional(),
    name: z.string(),
    description: z.string().optional(),
    type: stepTypeSchema,
    config: z.record(z.string(), z.unknown()).optional(),
    inputs: z.record(z.string(), z.unknown()).optional(),
    outputs: z.record(z.string(), z.unknown()).optional(),
    next: z
        .union([
            z.string(),
            z.array(z.string()),
            z.record(z.string(), z.string()),
        ])
        .optional(),
    condition: z.unknown().optional(), // ✅ Zod v4: z.function() não é mais suportado em objetos
    retry: z
        .object({
            maxAttempts: z.number().int().positive(),
            delayMs: z.number().int().nonnegative(),
            backoffMultiplier: z.number().positive().optional(),
            maxDelayMs: z.number().int().positive().optional(),
        })
        .optional(),
    timeout: z.number().int().positive().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

export const workflowDefinitionSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    version: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    steps: z.record(z.string(), stepDefinitionSchema),
    entryPoints: z.array(z.string()).min(1),
    config: z
        .object({
            timeout: z.number().positive().optional(),
            maxConcurrency: z.number().positive().optional(),
            enableStateTracking: z.boolean().optional(),
            enableRetry: z.boolean().optional(),
        })
        .optional(),
    triggers: z
        .array(
            z.object({
                type: z.string(),
                config: z.record(z.string(), z.unknown()).optional(),
            }),
        )
        .optional(),
    signals: z
        .array(
            z.object({
                name: z.string(),
                description: z.string().optional(),
                schema: z.record(z.string(), z.unknown()).optional(),
            }),
        )
        .optional(),
    dependencies: z.array(z.string()).optional(),
});

export const workflowExecutionOptionsSchema = z.object({
    inputs: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    timeout: z.number().positive().optional(),
    maxConcurrency: z.number().positive().optional(),
    enableStateTracking: z.boolean().optional(),
    context: z.record(z.string(), z.unknown()).optional(),
});

// ===== HELPER FUNCTIONS =====

/**
 * Create Workflow Context with defaults
 */
export function createWorkflowContext(
    workflowName: string,
    executionId: string,
    tenantId: string,
    options: {
        correlationId?: string;
        parentId?: string;
        inputs?: Record<string, unknown>;
        // memoryService?: MemoryService;
        persistorService?: Persistor;
        metadata?: Metadata;
    } = {},
): WorkflowContext {
    return {
        // BaseContext
        executionId,
        tenantId,
        correlationId: options.correlationId || 'default',
        startTime: Date.now(),

        // WorkflowContext specific
        workflowName,
        //memoryService: options.memoryService,
        persistorService: options.persistorService,
        stateManager: new ContextStateService(
            {},
            {
                maxNamespaceSize: 1000,
                maxNamespaces: 100,
            },
        ),
        data: {},
        currentSteps: [],
        completedSteps: [],
        failedSteps: [],
        inputs: options.inputs,
        signal: new AbortController().signal,
        isPaused: false,

        cleanup: async () => {
            // Cleanup logic will be implemented by the engine
        },
    };
}

/**
 * Create Step Context with defaults
 */
export function createStepContext(
    stepId: string,
    stepName: string,
    stepType: StepType,
    workflowContext: WorkflowContext,
    inputs: Record<string, unknown> = {},
    options: {
        attempt?: number;
        maxAttempts?: number;
        metadata?: Metadata;
    } = {},
): StepContext {
    return {
        // BaseContext
        tenantId: workflowContext.tenantId,
        correlationId: workflowContext.correlationId,
        startTime: Date.now(),

        // StepContext specific
        stepId,
        stepName,
        stepType,
        workflowContext,
        inputs,
        outputs: {},
        attempt: options.attempt || 1,
        maxAttempts: options.maxAttempts || 1,
        signal: workflowContext.signal,

        cleanup: async () => {
            // Cleanup logic will be implemented by the engine
        },
    };
}

/**
 * Validate Workflow Definition
 */
export function validateWorkflowDefinition(
    definition: unknown,
): definition is WorkflowDefinition {
    try {
        workflowDefinitionSchema.parse(definition);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validate Step Definition
 */
export function validateStepDefinition(
    definition: unknown,
): definition is StepDefinition {
    try {
        stepDefinitionSchema.parse(definition);
        return true;
    } catch {
        return false;
    }
}

/**
 * Create a simple workflow definition helper
 */
export function defineWorkflow(
    name: string,
    description: string,
    steps: Record<string, StepDefinition>,
    entryPoints: string[],
    options: Partial<
        Omit<
            WorkflowDefinition,
            'name' | 'description' | 'steps' | 'entryPoints'
        >
    > = {},
): WorkflowDefinition {
    return {
        name,
        description,
        steps,
        entryPoints,
        ...options,
    };
}

/**
 * Create a simple step definition helper
 */
export function defineStep(
    name: string,
    type: StepType,
    options: Partial<Omit<StepDefinition, 'name' | 'type'>> = {},
): StepDefinition {
    return {
        name,
        type,
        ...options,
    };
}

/**
 * Create a workflow object compatible with the Kernel
 * This wraps a WorkflowDefinition and provides the createContext method
 */
export function createWorkflow(
    definition: WorkflowDefinition,
    options: {
        tenantId?: string;
        //memoryService?: MemoryService;
        persistorService?: Persistor;
    } = {},
): Workflow {
    return {
        name: definition.name,
        description: definition.description,

        createContext(): WorkflowContext {
            const executionId = IdGenerator.executionId();
            const tenantId = options.tenantId || 'default';

            return createWorkflowContext(
                definition.name,
                executionId,
                tenantId,
                {
                    //memoryService: options.memoryService,
                    persistorService: options.persistorService,
                    metadata: definition.metadata,
                },
            );
        },

        on(
            eventType: string,
            _handler: (event: unknown) => void | Promise<void>,
        ): void {
            // Basic event handling - can be extended
            console.log(`Event handler registered for ${eventType}`);
        },

        emit(eventType: string, data?: unknown): void {
            // Basic event emission - can be extended
            console.log(`Event emitted: ${eventType}`, data);
        },

        async pause(reason?: string): Promise<string> {
            // Basic pause implementation
            const snapshotId = `snapshot_${Date.now()}`;
            console.log(`Workflow paused: ${reason}`, { snapshotId });
            return snapshotId;
        },

        async resume(snapshotId?: string): Promise<void> {
            // Basic resume implementation
            console.log(`Workflow resumed from snapshot: ${snapshotId}`);
        },

        async cleanup(): Promise<void> {
            // Basic cleanup implementation
            console.log('Workflow cleanup completed');
        },
    };
}

// ===== WORKFLOW INTERFACE =====

/**
 * Workflow Interface - Runtime workflow object with createContext method
 * This is what the Kernel expects to receive
 */
export interface Workflow {
    /**
     * Create a workflow context for execution
     * This is the main method expected by the Kernel
     */
    createContext(): WorkflowContext;

    /**
     * Optional: Workflow name
     */
    name?: string;

    /**
     * Optional: Workflow description
     */
    description?: string;

    /**
     * Optional: Event handlers
     */
    on?(
        eventType: string,
        handler: (event: unknown) => void | Promise<void>,
    ): void;

    /**
     * Optional: Event emission
     */
    emit?(eventType: string, data?: unknown): void;

    /**
     * Optional: Pause workflow
     */
    pause?(reason?: string): Promise<string>;

    /**
     * Optional: Resume workflow
     */
    resume?(snapshotId?: string): Promise<void>;

    /**
     * Optional: Cleanup workflow
     */
    cleanup?(): Promise<void>;
}
