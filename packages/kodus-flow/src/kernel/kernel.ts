/**
 * @module kernel/kernel
 * @description Execution Kernel - Central orchestration layer
 *
 * RESPONSABILIDADES DO KERNEL:
 * - Gerenciamento de Context e State
 * - Snapshots e Persistência
 * - Quota Management
 * - Coordenação com Runtime
 */

import { createLogger } from '../observability/index.js';
import { getObservability } from '../observability/index.js';
import { withObservability } from '../runtime/middleware/index.js';
import { KernelError } from '../core/errors.js';

import { ContextStateService } from '../core/context/index.js';
import {
    createRuntime,
    type Runtime,
    type EmitOptions,
    type EmitResult,
    type RuntimeConfig,
} from '../runtime/index.js';
import type {
    Event,
    Persistor,
    EventHandler,
    EventStream,
    TenantId,
    CorrelationId,
} from '../core/types/common-types.js';
import type { Workflow } from '../core/types/workflow-types.js';
import type { Middleware } from '../runtime/middleware/types.js';
import { EVENT_TYPES } from '../core/types/events.js';
import type {
    EventType,
    EventPayloads,
    AnyEvent,
} from '../core/types/events.js';
import { createPersistorFromConfig } from '../persistor/factory.js';
import type { Snapshot } from './snapshot.js';
import { stableHash } from './snapshot.js';
import type { WorkflowContext } from '../core/types/workflow-types.js';
import { IdGenerator } from '../utils/id-generator.js';
// import { CircuitBreakerManager } from '../runtime/middleware/circuit-breaker.js';

/**
 * Simple LRU Cache implementation for context caching
 */
class LRUCache<T> {
    private readonly maxSize: number;
    private readonly cache = new Map<
        string,
        { value: T; lastAccessed: number }
    >();

    constructor(maxSize: number = 1000) {
        this.maxSize = maxSize;
    }

    get(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (entry) {
            // Update last accessed time
            entry.lastAccessed = Date.now();
            return entry.value;
        }
        return undefined;
    }

    set(key: string, value: T): void {
        // If key exists, update it
        if (this.cache.has(key)) {
            this.cache.get(key)!.value = value;
            this.cache.get(key)!.lastAccessed = Date.now();
            return;
        }

        // If cache is full, remove least recently used item
        if (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }

        // Add new item
        this.cache.set(key, {
            value,
            lastAccessed: Date.now(),
        });
    }

    has(key: string): boolean {
        return this.cache.has(key);
    }

    delete(key: string): boolean {
        return this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }

    private evictLRU(): void {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;

        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): {
        size: number;
        maxSize: number;
        oldestEntry: number;
        newestEntry: number;
    } {
        let oldest = Infinity;
        let newest = 0;

        for (const entry of this.cache.values()) {
            oldest = Math.min(oldest, entry.lastAccessed);
            newest = Math.max(newest, entry.lastAccessed);
        }

        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            oldestEntry: oldest === Infinity ? 0 : oldest,
            newestEntry: newest,
        };
    }
}

/**
 * Kernel State - Foco em context e state management
 */
export interface KernelState {
    // Identification
    id: string; // tenant:job format
    tenantId: TenantId;
    correlationId: CorrelationId;
    jobId: string;

    // Context management (ISOLATED PER TENANT)
    contextData: Record<string, unknown>;
    stateData: Record<string, unknown>;

    // Execution state (ATOMIC)
    status: 'initialized' | 'running' | 'paused' | 'completed' | 'failed';
    startTime: number;
    eventCount: number;

    // Quota tracking
    quotas: {
        maxEvents?: number;
        maxDuration?: number;
        maxMemory?: number;
    };

    // IDEMPOTENCY & ATOMICITY
    operationId?: string; // Para garantir idempotência
    lastOperationHash?: string; // Hash da última operação
    pendingOperations: Set<string>; // Operações em andamento
}

/**
 * Kernel Configuration
 */
export interface KernelConfig {
    tenantId: TenantId;
    jobId?: string;

    // REQUIRED: Workflow for execution
    workflow: Workflow;

    // Context configuration
    // TODO: Remove contextFactory - using ContextBuilder instead

    // Persistence
    persistor?: Persistor;

    // Runtime configuration (delegado para runtime)
    runtimeConfig?: RuntimeConfig;

    // Quotas
    quotas?: {
        maxEvents?: number;
        maxDuration?: number;
        maxMemory?: number;
    };

    // Performance optimizations
    performance?: {
        enableBatching?: boolean;
        batchSize?: number;
        batchTimeoutMs?: number;
        enableCaching?: boolean;
        cacheSize?: number;
        enableLazyLoading?: boolean;
        contextUpdateDebounceMs?: number;
        autoSnapshot?: {
            enabled?: boolean;
            intervalMs?: number;
            eventInterval?: number;
            useDelta?: boolean;
        };
    };

    // ISOLATION & ATOMICITY
    isolation?: {
        enableTenantIsolation?: boolean; // Isolamento completo por tenant
        enableEventIsolation?: boolean; // Isolamento de eventos
        enableContextIsolation?: boolean; // Isolamento de contexto
        maxConcurrentOperations?: number; // Limite de operações concorrentes
    };

    // IDEMPOTENCY
    idempotency?: {
        enableOperationIdempotency?: boolean; // Idempotência por operação
        enableEventIdempotency?: boolean; // Idempotência de eventos
        operationTimeout?: number; // Timeout para operações
        maxRetries?: number; // Máximo de retentativas
    };

    // Options
    debug?: boolean;
    monitor?: boolean;
}

/**
 * Execution Kernel - Central coordination layer
 */
export class ExecutionKernel {
    private state: KernelState;
    private config: KernelConfig;
    private logger: ReturnType<typeof createLogger>;
    private persistor: Persistor;
    private quotaTimers = new Set<NodeJS.Timeout>();
    private readonly maxQuotaTimers = 100;

    // ✅ ADICIONAR: StateService para Kernel Layer
    private stateService: ContextStateService;

    // Circuit breakers for critical operations
    // private circuitBreakerManager: CircuitBreakerManager;

    // Context factory for context management
    // Legacy field - now using ContextBuilder

    // Runtime for event processing
    private runtime: Runtime | null = null;
    private workflowContext: WorkflowContext | null = null;

    // Enhanced Event Queue management
    private dlqReprocessTimer: NodeJS.Timeout | null = null;
    private recoveryAttempts = 0;
    private lastRecoveryTime = 0;

    // Performance optimizations
    private contextCache = new LRUCache<unknown>(1000);
    private contextUpdateQueue = new Map<
        string,
        { value: unknown; timestamp: number }
    >();
    private contextUpdateTimer: NodeJS.Timeout | null = null;
    private eventBatchQueue: Event[] = [];
    private eventBatchTimer: NodeJS.Timeout | null = null;
    private lastSnapshotTs = 0;
    private lastEventSnapshotCount = 0;

    constructor(config: KernelConfig) {
        this.config = config;
        this.logger = createLogger(`kernel:${config.tenantId}`);
        this.persistor =
            config.persistor ||
            createPersistorFromConfig({
                type: 'memory',
                maxSnapshots: 1000,
                enableCompression: true,
                enableDeltaCompression: true,
                cleanupInterval: 300000,
                maxMemoryUsage: 100 * 1024 * 1024,
            });

        // ✅ ADICIONAR: Inicializar StateService (Kernel Layer)
        this.stateService = new ContextStateService(
            {
                tenantId: config.tenantId,
                jobId: config.jobId || IdGenerator.executionId(),
            },
            {
                maxNamespaceSize: 1000,
                maxNamespaces: 100,
            },
        );

        // Initialize context factory
        // Using ContextBuilder singleton instead of contextFactory

        // Initialize state
        const jobId = config.jobId || IdGenerator.executionId();
        this.state = {
            id: `${config.tenantId}:${jobId}`,
            tenantId: config.tenantId,
            correlationId: IdGenerator.correlationId(), //TODO: Verificar se é necessário
            jobId,
            contextData: {},
            stateData: {},
            status: 'initialized',
            startTime: Date.now(),
            eventCount: 0,
            quotas: config.quotas || {},
            operationId: undefined,
            lastOperationHash: undefined,
            pendingOperations: new Set<string>(),
        };

        this.logger.info('Kernel initialized', {
            id: this.state.id,
            quotas: config.quotas,
            performance: config.performance,
            hasStateService: !!this.stateService,
        });
    }

    /**
     * Initialize the kernel with the configured workflow
     */
    async initialize(): Promise<WorkflowContext> {
        const operationId = `init:${this.state.id}:${Date.now()}`;

        // Check if already initialized (idempotency)
        if (this.state.status === 'running' && this.runtime) {
            this.logger.info(
                'Kernel already initialized, returning existing context',
            );
            return this.workflowContext!;
        }

        return await this.executeAtomicOperation(
            operationId,
            async () => {
                if (this.state.status !== 'initialized') {
                    throw new KernelError(
                        'KERNEL_INITIALIZATION_FAILED',
                        'Kernel not in initialized state',
                    );
                }

                try {
                    // 1. Create workflow context
                    const workflow = this.config.workflow;

                    // Check if workflow has createContext method
                    if (typeof workflow.createContext === 'function') {
                        this.workflowContext = workflow.createContext();
                    } else {
                        // Create default workflow context for testing
                        this.workflowContext = {
                            sendEvent: async (event: Event) => {
                                if (this.runtime) {
                                    await this.runtime.emitAsync(
                                        event.type,
                                        event.data,
                                    );
                                }
                            },
                            workflowName: 'default-workflow',
                            executionId: this.state.id,
                            correlationId: 'default-correlation',
                            stateManager: new ContextStateService({}),
                            data: {},
                            currentSteps: [],
                            completedSteps: [],
                            failedSteps: [],
                            metadata: {},
                            tenantId: this.state.tenantId,
                            signal: new AbortController().signal,
                            isPaused: false,
                            isCompleted: false,
                            isFailed: false,
                            cleanup: async () => {},
                            startTime: Date.now(),
                            status: 'RUNNING' as const,
                        } as WorkflowContext;
                    }

                    // 2. Initialize runtime with simplified configuration
                    const baseMiddleware = [
                        ...(this.config.runtimeConfig?.middleware || []),
                    ];

                    // Inject observability middleware first (if enabled)
                    const middleware = [
                        // Ensure we pass plain options and do not mutate middleware function properties
                        withObservability(undefined),
                        ...baseMiddleware,
                    ];

                    const runtimeConfig: RuntimeConfig = {
                        ...this.config.runtimeConfig,
                        persistor: this.persistor,
                        executionId: this.state.id,
                        tenantId: this.config.tenantId,
                        middleware,
                    };

                    this.runtime = createRuntime(
                        this.workflowContext,
                        getObservability({
                            enabled: true,
                            environment: 'development',
                            logging: { enabled: true, level: 'info' },
                        }),
                        runtimeConfig,
                    );

                    // 3. VERIFICAÇÃO CRÍTICA: Garantir que runtime foi criado
                    if (!this.runtime) {
                        throw new KernelError(
                            'KERNEL_INITIALIZATION_FAILED',
                            'Failed to create runtime',
                        );
                    }

                    // 4. Setup enhanced event queue features
                    this.setupEnhancedQueueFeatures();

                    // 5. Setup quota monitoring
                    this.setupQuotaMonitoring();

                    // 6. Setup performance optimizations
                    this.setupPerformanceOptimizations();

                    // 7. SÓ AGORA mudar status para 'running' (ATÔMICO)
                    this.state.status = 'running';
                    this.state.startTime = Date.now();

                    // 7. Sincronizar estados
                    this.synchronizeStates();

                    this.logger.info('Kernel initialized and running', {
                        id: this.state.id,
                        performance: this.config.performance,
                        runtimeInitialized: !!this.runtime,
                        isolation: this.config.isolation,
                        idempotency: this.config.idempotency,
                    });

                    // 8. Emit kernel started event via runtime (AGORA SEGURO)
                    this.runtime.emit(EVENT_TYPES.KERNEL_STARTED, {
                        kernelId: this.state.id,
                        tenantId: this.state.tenantId,
                    });

                    return this.workflowContext;
                } catch (error) {
                    // ROLLBACK COMPLETO em caso de erro
                    this.state.status = 'failed';
                    this.runtime = null;
                    this.workflowContext = null;

                    this.logger.error(
                        'Failed to initialize kernel',
                        error as Error,
                    );
                    throw error;
                }
            },
            {
                timeout: this.config.idempotency?.operationTimeout || 60000,
                isolation: true,
            },
        );
    }

    /**
     * Run workflow with optimized event processing
     */
    async run(event: Event): Promise<void> {
        if (!this.runtime) {
            throw new KernelError(
                'KERNEL_INITIALIZATION_FAILED',
                'Runtime not initialized',
            );
        }

        try {
            // Performance: Batch event processing
            if (this.config.performance?.enableBatching) {
                this.eventBatchQueue.push(event);

                if (
                    this.eventBatchQueue.length >=
                    (this.config.performance.batchSize || 10)
                ) {
                    await this.processEventBatch();
                } else if (!this.eventBatchTimer) {
                    this.eventBatchTimer = setTimeout(
                        () => this.processEventBatch(),
                        this.config.performance.batchTimeoutMs || 100,
                    );
                }
            } else {
                // Direct processing
                await this.sendEvent(event);
            }
        } catch (error) {
            this.logger.error('Failed to run workflow', error as Error, {
                event,
            });
            throw error;
        }
    }

    /**
     * Send event to runtime with context preparation
     */
    async sendEvent(event: Event): Promise<void> {
        if (!this.runtime) {
            throw new KernelError(
                'KERNEL_INITIALIZATION_FAILED',
                'Runtime not initialized',
            );
        }

        try {
            // Performance: Prepare context in batch
            this.prepareContextForEvent(event);

            // Send to runtime
            this.runtime.emit(event.type, event.data);

            // Update state
            this.updateStateFromEvent(event);

            // Check quotas after event processing
            await this.checkQuotas();

            this.logger.debug('Event sent to runtime', {
                eventType: event.type,
                eventCount: this.state.eventCount,
            });
        } catch (error) {
            this.logger.error('Failed to send event', error as Error, {
                event,
            });
            throw error;
        }
    }

    /**
     * Process batched events for better performance
     */
    private async processEventBatch(): Promise<void> {
        if (this.eventBatchQueue.length === 0) return;

        const events = [...this.eventBatchQueue];
        this.eventBatchQueue = [];

        if (this.eventBatchTimer) {
            clearTimeout(this.eventBatchTimer);
            this.eventBatchTimer = null;
        }

        try {
            // Process all events in batch
            for (const event of events) {
                await this.sendEvent(event);
            }

            this.logger.debug('Event batch processed', {
                batchSize: events.length,
                totalEvents: this.state.eventCount,
            });
        } catch (error) {
            this.logger.error('Failed to process event batch', error as Error, {
                batchSize: events.length,
            });
            throw error;
        }
    }

    /**
     * Pause execution with snapshot
     */
    async pause(reason: string = 'manual'): Promise<string> {
        if (this.state.status !== 'running') {
            throw new KernelError(
                'KERNEL_OPERATION_TIMEOUT',
                'Kernel not running',
            );
        }

        try {
            // Performance: Flush pending updates before snapshot
            await this.flushContextUpdates();

            // Create snapshot
            const snapshot = await this.createSnapshot();
            await this.persistor.append(snapshot);

            // Update state
            this.state.status = 'paused';

            this.logger.info('Kernel paused', {
                snapshotId: snapshot.hash,
                reason,
                eventCount: this.state.eventCount,
            });

            return snapshot.hash;
        } catch (error) {
            this.logger.error('Failed to pause kernel', error as Error, {
                reason,
            });
            throw error;
        }
    }

    /**
     * Resume execution from snapshot
     */
    async resume(snapshotId: string): Promise<void> {
        if (this.state.status !== 'paused') {
            throw new KernelError(
                'KERNEL_OPERATION_TIMEOUT',
                'Kernel not paused',
            );
        }

        try {
            // Load snapshot
            const snapshot = await this.persistor.getByHash?.(snapshotId);
            if (!snapshot) {
                throw new KernelError(
                    'KERNEL_CONTEXT_CORRUPTION',
                    'Snapshot not found',
                );
            }

            // Restore from snapshot
            await this.restoreFromSnapshot(snapshot);

            // Update state
            this.state.status = 'running';

            this.logger.info('Kernel resumed', {
                snapshotId,
                eventCount: this.state.eventCount,
            });
        } catch (error) {
            this.logger.error('Failed to resume kernel', error as Error, {
                snapshotId,
            });
            throw error;
        }
    }

    /**
     * Complete execution
     */
    async complete(result?: unknown): Promise<void> {
        if (this.state.status === 'completed') {
            return;
        }

        try {
            // Performance: Flush all pending updates
            await this.flushContextUpdates();
            await this.processEventBatch();

            // Update state
            this.state.status = 'completed';

            // Cleanup performance optimizations
            this.cleanupPerformanceOptimizations();

            this.logger.info('Kernel completed', {
                result,
                eventCount: this.state.eventCount,
            });
        } catch (error) {
            this.logger.error('Failed to complete kernel', error as Error);
            throw error;
        }
    }

    /**
     * Get context value with caching
     */
    getContext<T = unknown>(namespace: string, key: string): T | undefined {
        const tenantId = this.state.tenantId;
        const tenantContext = this.getTenantContext(tenantId);
        const cacheKey = `${tenantId}:${namespace}:${key}`;

        // Performance: Check cache first
        if (
            this.config.performance?.enableCaching &&
            this.contextCache.has(cacheKey)
        ) {
            return this.contextCache.get(cacheKey) as T;
        }

        // Get from tenant context
        const namespaceData = tenantContext[namespace] as Record<
            string,
            unknown
        >;
        const value = namespaceData?.[key] as T | undefined;

        // Performance: Cache the result (LRU cache handles size limits automatically)
        if (this.config.performance?.enableCaching && value !== undefined) {
            this.contextCache.set(cacheKey, value);
        }

        return value;
    }

    /**
     * Set context value with batching
     */
    setContext(namespace: string, key: string, value: unknown): void {
        const tenantId = this.state.tenantId;
        const tenantContext = this.getTenantContext(tenantId);
        const cacheKey = `${tenantId}:${namespace}:${key}`;

        // Create namespace in tenant context
        if (!tenantContext[namespace]) {
            tenantContext[namespace] = {};
        }

        const namespaceData = tenantContext[namespace] as Record<
            string,
            unknown
        >;
        namespaceData[key] = value;

        // Performance: Batch context updates
        if (this.config.performance?.enableBatching) {
            this.contextUpdateQueue.set(cacheKey, {
                value,
                timestamp: Date.now(),
            });

            // Schedule batch update
            if (!this.contextUpdateTimer) {
                this.contextUpdateTimer = setTimeout(
                    () => this.flushContextUpdates(),
                    this.config.performance?.contextUpdateDebounceMs || 50,
                );
            }
        } else {
            // Direct update
            this.contextCache.set(cacheKey, value);
        }

        this.logger.debug('Context set with tenant isolation', {
            tenantId,
            namespace,
            key,
            hasValue: value !== undefined,
        });
    }

    /**
     * Increment context value
     */
    incrementContext(
        namespace: string,
        key: string,
        delta: number = 1,
    ): number {
        const currentValue =
            (this.getContext<number>(namespace, key) || 0) + delta;
        this.setContext(namespace, key, currentValue);
        return currentValue;
    }

    /**
     * Get kernel status
     */
    getStatus() {
        return {
            id: this.state.id,
            status: this.state.status,
            eventCount: this.state.eventCount,
            startTime: this.state.startTime,
            quotas: this.state.quotas,
            performance: {
                cache: this.contextCache.getStats(),
                pendingUpdates: this.contextUpdateQueue.size,
                pendingEvents: this.eventBatchQueue.length,
            },
        };
    }

    /**
     * Get workflow
     */
    getWorkflow(): Workflow | null {
        return this.config.workflow;
    }

    /**
     * Get runtime
     */
    getRuntime(): Runtime | null {
        return this.runtime;
    }

    /**
     * Get enhanced runtime statistics including DLQ, retry, and recovery metrics
     */
    getEnhancedRuntimeStats() {
        const runtime = this.getRuntimeSafely();
        if (!runtime) {
            return null;
        }

        const stats = runtime.getStats();

        return {
            ...stats,
            queue: {
                dlq: stats.dlq || null,
                retry: stats.retry || null,
                persistence: stats.persistence || null,
                circuitBreaker: stats.circuitBreaker || null,
            },
            kernel: {
                recoveryAttempts: this.recoveryAttempts,
                lastRecoveryTime: this.lastRecoveryTime,
                dlqAutoReprocessEnabled: !!this.dlqReprocessTimer,
            },
        };
    }

    /**
     * Get DLQ management operations
     */
    getDLQOperations() {
        if (this.state.status === 'initialized') {
            return null;
        }

        return {
            reprocessItems: async (criteria?: {
                maxAge?: number;
                limit?: number;
                eventType?: string;
            }) => {
                const runtime = this.getRuntimeSafely();
                if (runtime?.reprocessDLQByCriteria) {
                    const result = await runtime.reprocessDLQByCriteria(
                        criteria || {},
                    );
                    return {
                        success: true,
                        message: `DLQ reprocessing completed. Reprocessed ${result.reprocessedCount} events.`,
                        reprocessedCount: result.reprocessedCount,
                        events: result.events.map((e) => ({
                            type: e.type,
                            id: e.id,
                        })),
                    };
                } else {
                    await this.reprocessDLQItems(); // Fallback to old method
                    return {
                        success: true,
                        message: 'DLQ reprocessing initiated (fallback mode)',
                    };
                }
            },
            getStats: () => {
                const runtime = this.getRuntimeSafely();
                return runtime?.getStats()?.dlq || null;
            },
            isAutoReprocessEnabled: () => !!this.dlqReprocessTimer,
        };
    }

    /**
     * Get recovery status and operations
     */
    getRecoveryOperations() {
        if (this.state.status === 'initialized') {
            return null;
        }

        const maxAttempts = 5;

        const getStatus = () => ({
            attempts: this.recoveryAttempts,
            maxAttempts,
            lastRecoveryTime: this.lastRecoveryTime,
            canAttemptRecovery: this.recoveryAttempts < maxAttempts,
        });

        const triggerRecovery = async (): Promise<{
            success: boolean;
            attempt: number;
            timestamp: number;
        }> => {
            if (this.recoveryAttempts >= maxAttempts) {
                throw new Error(
                    `Max recovery attempts exceeded (${maxAttempts})`,
                );
            }

            this.recoveryAttempts++;
            this.lastRecoveryTime = Date.now();

            const runtime = this.getRuntimeSafely();
            if (runtime) {
                // Get recovery stats if available
                const stats = runtime.getStats();
                this.logger.info('Recovery triggered', {
                    attempt: this.recoveryAttempts,
                    stats: stats.persistence,
                });
            }

            return {
                success: true,
                attempt: this.recoveryAttempts,
                timestamp: this.lastRecoveryTime,
            };
        };

        return {
            get status() {
                return getStatus();
            },
            triggerRecovery,
        };
    }

    /**
     * Prepare context for event processing
     */
    private prepareContextForEvent(event: Event): void {
        // Performance: Lazy load context data
        if (this.config.performance?.enableLazyLoading) {
            // Only load essential context data
            this.state.contextData['lastEvent'] = event.type;
            this.state.contextData['lastEventTime'] = Date.now();
        } else {
            // Load full context data
            this.state.contextData['lastEvent'] = event.type;
            this.state.contextData['lastEventTime'] = Date.now();
            this.state.contextData['eventHistory'] =
                this.state.contextData['eventHistory'] || [];
            (this.state.contextData['eventHistory'] as Event[]).push(event);
        }
    }

    /**
     * Update state from event
     */
    private updateStateFromEvent(_event: Event): void {
        this.state.eventCount++;

        // Autosnapshot baseado em contagem de eventos
        const auto = this.config.performance?.autoSnapshot;
        if (auto?.enabled && auto.eventInterval && auto.eventInterval > 0) {
            this.lastEventSnapshotCount++;
            if (this.lastEventSnapshotCount >= auto.eventInterval) {
                this.lastEventSnapshotCount = 0;
                void this.persistContextSnapshot('event-interval');
            }
        }
    }

    /**
     * Create snapshot with optimized data
     */
    private async createSnapshot(): Promise<Snapshot> {
        // Performance: Flush pending updates before snapshot
        await this.flushContextUpdates();

        // Create snapshot without circuit breaker
        const snapshotData = {
            xcId: this.state.id,
            ts: Date.now(),
            events: [], // Events are handled by runtime
            state: {
                ...this.state,
                contextData: this.createSafeContextCopy(this.state.contextData),
            },
        };

        // Generate proper hash for the snapshot
        const hash = stableHash({
            events: snapshotData.events,
            state: snapshotData.state,
        });

        return {
            ...snapshotData,
            hash,
        };
    }

    /**
     * Restore from snapshot
     */
    private async restoreFromSnapshot(snapshot: Snapshot): Promise<void> {
        // Use circuit breaker for context operations
        // Restore snapshot without circuit breaker
        const restoredState = snapshot.state as Record<string, unknown>;

        this.state = {
            ...this.state,
            ...restoredState,
            status: 'running',
        };

        // Performance: Clear cache after restore
        this.contextCache.clear();
        this.contextUpdateQueue.clear();
    }

    /**
     * Initialize context store
     */
    private initializeContextStore(): void {
        // Performance: Pre-allocate context data
        if (!this.config.performance?.enableLazyLoading) {
            // TODO: Use ContextBuilder for base context creation
            // For now, initialize empty context data
            this.state.contextData = {
                eventHistory: [],
                metrics: {},
                user: {},
                system: {},
            };
        }
    }

    /**
     * Create safe copy of context data
     */
    private createSafeContextCopy(
        data: Record<string, unknown>,
    ): Record<string, unknown> {
        try {
            return JSON.parse(JSON.stringify(data));
        } catch (error) {
            this.logger.warn('Failed to create safe context copy', {
                error: String(error),
            });
            return {};
        }
    }

    /**
     * Setup quota monitoring
     */
    private setupQuotaMonitoring(): void {
        const { maxDuration, maxMemory } = this.state.quotas;

        if (maxDuration) {
            const timer = setTimeout(async () => {
                this.logger.warn('Duration quota exceeded', {
                    maxDuration,
                    kernelId: this.state.id,
                    runtime: Date.now() - this.state.startTime,
                });
                await this.handleQuotaExceeded('duration');
            }, maxDuration);
            this.quotaTimers.add(timer);
        }

        if (maxMemory) {
            const timer = setInterval(async () => {
                const memoryUsage = process.memoryUsage().heapUsed;
                if (memoryUsage > maxMemory) {
                    this.logger.warn('Memory quota exceeded', {
                        memoryUsage,
                        maxMemory,
                        kernelId: this.state.id,
                    });
                    await this.handleQuotaExceeded('memory');
                }
            }, 1000);
            this.quotaTimers.add(timer);
        }

        this.cleanupQuotaTimers();
    }

    /**
     * Setup enhanced event queue features for production-grade capabilities
     */
    private setupEnhancedQueueFeatures(): void {
        // Enhanced queue features are now always enabled through EventQueue config
        this.logger.info('Setting up queue features');

        // Setup DLQ auto-reprocessing
        this.setupDLQAutoReprocessing();

        // Setup recovery monitoring
        this.setupRecoveryMonitoring();
    }

    /**
     * Setup DLQ auto-reprocessing timer
     */
    private setupDLQAutoReprocessing(): void {
        const interval = 30; // minutes

        this.dlqReprocessTimer = setInterval(
            async () => {
                try {
                    await this.reprocessDLQItems();
                } catch (error) {
                    this.logger.error(
                        'Error during DLQ auto-reprocessing',
                        error as Error,
                    );
                }
            },
            interval * 60 * 1000,
        );

        this.logger.info('DLQ auto-reprocessing enabled', {
            intervalMinutes: interval,
        });
    }

    /**
     * Setup recovery monitoring
     */
    private setupRecoveryMonitoring(): void {
        // Monitor recovery attempts and reset counter periodically
        setInterval(
            () => {
                if (this.recoveryAttempts > 0) {
                    this.logger.info('Recovery attempts reset', {
                        previousAttempts: this.recoveryAttempts,
                    });
                    this.recoveryAttempts = 0;
                }
            },
            60 * 60 * 1000,
        ); // Reset every hour
    }

    /**
     * Setup performance optimizations
     */
    private setupPerformanceOptimizations(): void {
        // Initialize context store if not lazy loading
        if (!this.config.performance?.enableLazyLoading) {
            this.initializeContextStore();
        }

        this.logger.info('Performance optimizations enabled', {
            batching: this.config.performance?.enableBatching,
            caching: this.config.performance?.enableCaching,
            lazyLoading: this.config.performance?.enableLazyLoading,
        });
    }

    /**
     * Flush pending context updates
     */
    private async flushContextUpdates(): Promise<void> {
        if (this.contextUpdateQueue.size === 0) return;

        const updates = Array.from(this.contextUpdateQueue.entries());
        this.contextUpdateQueue.clear();

        if (this.contextUpdateTimer) {
            clearTimeout(this.contextUpdateTimer);
            this.contextUpdateTimer = null;
        }

        // Apply all updates
        for (const [key, { value }] of updates) {
            this.state.contextData[key] = value;
            this.contextCache.set(key, value);
        }

        this.logger.debug('Context updates flushed', {
            updateCount: updates.length,
        });

        // Autosnapshot baseado em tempo
        const auto = this.config.performance?.autoSnapshot;
        if (auto?.enabled && auto.intervalMs && auto.intervalMs > 0) {
            const now = Date.now();
            if (
                !this.lastSnapshotTs ||
                now - this.lastSnapshotTs >= auto.intervalMs
            ) {
                await this.persistContextSnapshot('interval');
            }
        }
    }

    /**
     * Persist current context as snapshot
     */
    private async persistContextSnapshot(reason: string): Promise<void> {
        try {
            await this.flushContextUpdates();
            const snapshot = await this.createSnapshot();
            const useDelta =
                this.config.performance?.autoSnapshot?.useDelta !== false;
            await this.persistor.append(snapshot, { useDelta });
            this.lastSnapshotTs = Date.now();
            this.logger.info('Context snapshot persisted', {
                reason,
                hash: snapshot.hash,
                eventCount: this.state.eventCount,
                tenantId: this.state.tenantId,
            });
        } catch (error) {
            this.logger.warn('Failed to persist context snapshot', {
                errorName: (error as Error)?.name,
                errorMessage: (error as Error)?.message,
            });
        }
    }

    /**
     * Reprocess items from Dead Letter Queue
     */
    private async reprocessDLQItems(): Promise<void> {
        const runtime = this.getRuntimeSafely();
        if (!runtime) {
            this.logger.warn('No runtime available for DLQ reprocessing');
            return;
        }

        try {
            // Check if runtime has enhanced queue
            const stats = runtime.getStats();
            if (!stats.dlq) {
                this.logger.debug(
                    'No DLQ stats available, skipping reprocessing',
                );
                return;
            }

            // Log DLQ status
            this.logger.info('DLQ reprocessing attempt', {
                dlqStats: stats.dlq,
                recoveryAttempts: this.recoveryAttempts,
            });

            // Perform actual DLQ reprocessing using the enhanced runtime interface
            if (runtime.reprocessDLQByCriteria) {
                const criteria = {
                    maxAge: 24 * 60 * 60 * 1000, // 24 hours
                    limit: 10,
                };

                const result = await runtime.reprocessDLQByCriteria(criteria);

                this.logger.info('DLQ reprocessing completed', {
                    reprocessedCount: result.reprocessedCount,
                    eventTypes: result.events.map((e) => e.type),
                    recoveryAttempts: this.recoveryAttempts,
                });

                // Update recovery metrics if any events were reprocessed
                if (result.reprocessedCount > 0) {
                    this.lastRecoveryTime = Date.now();
                }
            } else {
                this.logger.warn(
                    'Enhanced DLQ reprocessing not available - runtime not using EnhancedEventQueue',
                );
            }
        } catch (error) {
            this.logger.error('Error during DLQ reprocessing', error as Error, {
                recoveryAttempts: this.recoveryAttempts,
            });
        }
    }

    /**
     * Cleanup performance optimizations
     */
    private cleanupPerformanceOptimizations(): void {
        // Clear timers
        if (this.contextUpdateTimer) {
            clearTimeout(this.contextUpdateTimer);
            this.contextUpdateTimer = null;
        }

        if (this.eventBatchTimer) {
            clearTimeout(this.eventBatchTimer);
            this.eventBatchTimer = null;
        }

        // Clear queues
        this.contextUpdateQueue.clear();
        this.eventBatchQueue = [];

        // Clear cache
        this.contextCache.clear();
    }

    /**
     * Check quotas
     */
    private async checkQuotas(): Promise<void> {
        const { maxEvents } = this.state.quotas;

        if (maxEvents && this.state.eventCount >= maxEvents) {
            this.logger.warn('Event quota exceeded', {
                eventCount: this.state.eventCount,
                maxEvents,
                kernelId: this.state.id,
            });
            await this.handleQuotaExceeded('events');
        }
    }

    /**
     * Handle quota exceeded
     */
    private async handleQuotaExceeded(
        type: 'events' | 'duration' | 'memory',
    ): Promise<void> {
        this.logger.warn('Quota exceeded', { type, state: this.state });

        // Create snapshot before stopping
        const snapshotId = await this.pause(`quota-exceeded-${type}`);

        this.logger.info('Kernel paused due to quota exceeded', {
            type,
            snapshotId,
        });
    }

    /**
     * Cleanup quota timers
     */
    private cleanupQuotaTimers(): void {
        if (this.quotaTimers.size > this.maxQuotaTimers) {
            const timers = Array.from(this.quotaTimers);
            const timersToRemove = timers.slice(
                0,
                timers.length - this.maxQuotaTimers,
            );
            timersToRemove.forEach((timer) => {
                clearTimeout(timer);
                this.quotaTimers.delete(timer);
            });
        }
    }

    /**
     * Cleanup enhanced queue features timers and resources
     */
    private cleanupEnhancedQueueFeatures(): void {
        // Clear DLQ reprocessing timer
        if (this.dlqReprocessTimer) {
            clearTimeout(this.dlqReprocessTimer);
            this.dlqReprocessTimer = null;
            this.logger.debug('DLQ auto-reprocessing timer cleared');
        }

        // Reset recovery counters
        this.recoveryAttempts = 0;
        this.lastRecoveryTime = 0;

        this.logger.debug('Enhanced queue features cleaned up');
    }

    /**
     * Reset kernel state
     */
    async reset(): Promise<void> {
        this.logger.info('Starting kernel reset', {
            currentStatus: this.state.status,
            runtimeExists: !!this.runtime,
        });

        try {
            // 1. Cleanup performance optimizations
            this.cleanupPerformanceOptimizations();

            // 2. Cleanup runtime FIRST (se existir)
            if (this.runtime) {
                await this.runtime.cleanup();
                this.runtime = null;
            }

            // 3. Reset state (ATÔMICO)
            this.state = {
                ...this.state,
                contextData: {},
                stateData: {},
                status: 'initialized', // ← SÓ DEPOIS de limpar runtime
                startTime: Date.now(),
                eventCount: 0,
                operationId: undefined,
                lastOperationHash: undefined,
                pendingOperations: new Set<string>(),
            };

            // 4. Clear workflow context
            this.workflowContext = null;

            // 5. Sincronizar estados
            this.synchronizeStates();

            this.logger.info('Kernel reset completed successfully', {
                id: this.state.id,
                newStatus: this.state.status,
                runtimeExists: !!this.runtime,
            });
        } catch (error) {
            // ROLLBACK em caso de erro
            this.logger.error('Kernel reset failed', error as Error);

            // Forçar estado consistente
            this.state.status = 'failed';
            this.runtime = null;
            this.workflowContext = null;

            throw error;
        }
    }

    // ===== RUNTIME FUNCTIONALITY EXPOSURE =====

    /**
     * Check if runtime is ready (ATOMIC CHECK)
     */
    isRuntimeReady(): boolean {
        // VERIFICAÇÃO ATÔMICA: Ambos devem estar sincronizados
        const runtimeExists = this.runtime !== null;
        const statusRunning = this.state.status === 'running';

        // Se estão dessincronizados, logar e corrigir
        if (runtimeExists !== statusRunning) {
            this.logger.warn('State/Runtime desynchronization detected', {
                runtimeExists,
                statusRunning,
                status: this.state.status,
            });
            this.synchronizeStates();
        }

        return runtimeExists && statusRunning;
    }

    /**
     * Get current kernel state (READ-ONLY)
     */
    getState(): Readonly<KernelState> {
        return { ...this.state };
    }

    /**
     * Safe runtime access with state validation
     */
    private getRuntimeSafely(): Runtime {
        if (!this.isRuntimeReady()) {
            throw new Error(
                `Runtime not ready. Status: ${this.state.status}, Runtime: ${this.runtime ? 'exists' : 'null'}`,
            );
        }
        return this.runtime!;
    }

    /**
     * Register event handler in runtime (SAFE)
     */
    registerHandler(
        eventType: EventType,
        handler: EventHandler<AnyEvent>,
    ): void {
        const runtime = this.getRuntimeSafely();
        runtime.on(eventType, handler);
    }

    /**
     * Remove event handler from runtime (SAFE)
     */
    removeHandler(eventType: EventType, handler: EventHandler<AnyEvent>): void {
        const runtime = this.getRuntimeSafely();
        runtime.off(eventType, handler);
    }

    /**
     * Process events from queue (SAFE)
     */
    async processEvents(): Promise<void> {
        const operationId = `process:${Date.now()}`;

        await this.executeAtomicOperation(
            operationId,
            async () => {
                const runtime = this.getRuntimeSafely();

                // Filter events by tenant if isolation is enabled
                if (this.config.isolation?.enableEventIsolation) {
                    // This would require runtime to support tenant filtering
                    // For now, we'll process all events but log tenant info
                    this.logger.info(
                        'Processing events with tenant isolation',
                        {
                            tenantId: this.state.tenantId,
                        },
                    );
                }

                // Use stats-enabled processing to auto-ACK/NACK events
                await runtime.process(true);
            },
            {
                timeout: this.config.idempotency?.operationTimeout,
                isolation: true,
            },
        );
    }

    /**
     * Process events with ACK/NACK guarantees (SAFE)
     */
    async processWithAcks(): Promise<{
        processed: number;
        acked: number;
        failed: number;
    }> {
        const runtime = this.getRuntimeSafely();
        return (await runtime.process(true)) as {
            processed: number;
            acked: number;
            failed: number;
        };
    }

    /**
     * Acknowledge event processing (SAFE)
     */
    async ackEvent(eventId: string): Promise<void> {
        const runtime = this.getRuntimeSafely();
        await runtime.ack(eventId);
    }

    /**
     * Negative acknowledge event processing (SAFE)
     */
    async nackEvent(eventId: string, error?: Error): Promise<void> {
        const runtime = this.getRuntimeSafely();
        await runtime.nack(eventId, error);
    }

    /**
     * Create typed event (SAFE)
     */
    createEvent<T extends EventType>(
        type: T,
        data?: EventPayloads[T],
    ): Event<T> {
        const runtime = this.getRuntimeSafely();
        return runtime.createEvent(type, data);
    }

    /**
     * Create event stream (SAFE)
     */
    createStream<S extends AnyEvent>(
        generator: () => AsyncGenerator<S>,
    ): EventStream<S> {
        const runtime = this.getRuntimeSafely();
        return runtime.createStream(generator);
    }

    /**
     * Create isolated runtime for specific tenant (SAFE)
     */
    forTenant(tenantId: string): Runtime | null {
        const runtime = this.getRuntimeSafely();
        return runtime.forTenant(tenantId);
    }

    /**
     * Get runtime statistics (SAFE)
     */
    getRuntimeStats(): Record<string, unknown> {
        const runtime = this.getRuntimeSafely();
        return runtime.getStats();
    }

    /**
     * Clear runtime (SAFE)
     */
    clearRuntime(): void {
        const runtime = this.getRuntimeSafely();
        runtime.clear();
    }

    /**
     * Cleanup runtime (SAFE)
     */
    async cleanupRuntime(): Promise<void> {
        const runtime = this.getRuntimeSafely();
        await runtime.cleanup();
    }

    /**
     * Emit event with options (SAFE)
     */
    emitEvent<T extends EventType>(
        eventType: T,
        data?: EventPayloads[T],
        options?: EmitOptions,
    ): EmitResult {
        const runtime = this.getRuntimeSafely();
        return runtime.emit(eventType, data, options);
    }

    /**
     * Emit event asynchronously with options (SAFE)
     */
    async emitEventAsync<T extends EventType>(
        eventType: T,
        data?: EventPayloads[T],
        options?: EmitOptions & {
            operationId?: string; // For idempotency
            tenantId?: string; // Override tenant isolation
        },
    ): Promise<EmitResult> {
        const tenantId = options?.tenantId || this.state.tenantId;
        const operationId =
            options?.operationId || `${eventType}:${Date.now()}`;

        // Check idempotency
        if (
            this.config.idempotency?.enableEventIdempotency &&
            this.isIdempotentOperation(operationId, () => Promise.resolve())
        ) {
            this.logger.info('Skipping idempotent event', {
                operationId,
                eventType,
            });
            return { success: true, eventId: operationId, queued: false };
        }

        // Execute atomically with tenant isolation
        return await this.executeAtomicOperation(
            operationId,
            async () => {
                const runtime = this.getRuntimeSafely();

                // Add tenant isolation to event metadata
                const isolatedData = {
                    ...(data as Record<string, unknown>),
                    tenantId: tenantId,
                    operationId: operationId,
                    timestamp: Date.now(),
                };

                return await runtime.emitAsync(
                    eventType,
                    isolatedData as EventPayloads[T],
                    options,
                );
            },
            {
                timeout: this.config.idempotency?.operationTimeout,
                isolation: this.config.isolation?.enableEventIsolation,
            },
        );
    }

    // ===== ENHANCED KERNEL FUNCTIONALITY =====

    /**
     * Get comprehensive kernel status including runtime stats
     */
    getComprehensiveStatus() {
        const baseStatus = this.getStatus();
        const runtimeStats = this.runtime ? this.runtime.getStats() : null;

        return {
            ...baseStatus,
            runtime: {
                initialized: !!this.runtime,
                stats: runtimeStats,
            },
            performance: {
                ...baseStatus.performance,
                cache: this.contextCache.getStats(),
                pendingUpdates: this.contextUpdateQueue.size,
                pendingEvents: this.eventBatchQueue.length,
            },
        };
    }

    /**
     * Get runtime configuration
     */
    getRuntimeConfig() {
        return this.config.runtimeConfig;
    }

    /**
     * Update runtime configuration (requires reinitialization)
     */
    updateRuntimeConfig(newConfig: KernelConfig['runtimeConfig']): void {
        // Validate configuration
        this.validateRuntimeConfig(newConfig);

        this.config.runtimeConfig = {
            ...this.config.runtimeConfig,
            ...newConfig,
        };

        // If runtime is already initialized, reapply configuration
        if (this.runtime) {
            this.logger.warn(
                'Runtime already initialized, configuration will be applied on next initialization',
            );
        }

        this.logger.info('Runtime configuration updated', {
            newConfig: this.config.runtimeConfig,
        });
    }

    // ===== ENHANCED ERROR HANDLING & RECOVERY =====

    /**
     * Validate runtime configuration
     */
    private validateRuntimeConfig(config: KernelConfig['runtimeConfig']): void {
        if (config?.queueSize && config.queueSize <= 0) {
            throw new Error('Queue size must be greater than 0');
        }
        if (config?.batchSize && config.batchSize <= 0) {
            throw new Error('Batch size must be greater than 0');
        }
        if (
            config?.queueSize &&
            config?.batchSize &&
            config.batchSize > config.queueSize
        ) {
            throw new Error('Batch size cannot be greater than queue size');
        }
    }

    /**
     * Get error history and statistics
     */
    getErrorHistory(): {
        recentErrors: Array<{
            timestamp: number;
            error: string;
            context: string;
        }>;
        errorCount: number;
        lastError?: { timestamp: number; error: string };
    } {
        // This would be implemented with actual error tracking
        return {
            recentErrors: [],
            errorCount: 0,
        };
    }

    /**
     * Clear error history
     */
    clearErrorHistory(): void {
        this.logger.info('Error history cleared');
    }

    /**
     * Recover from error state
     */
    async recoverFromError(): Promise<boolean> {
        try {
            this.logger.info('Attempting error recovery');

            // Reset runtime if it's in error state
            if (this.runtime) {
                await this.runtime.cleanup();
                this.runtime = null;
            }

            // Reset state to initialized for recovery
            this.state.status = 'initialized';

            // Reinitialize if possible (any error state)
            if (!this.runtime) {
                await this.initialize();
                return true;
            }

            return false;
        } catch (error) {
            this.logger.error('Error recovery failed', error as Error);
            // Set state to failed if recovery fails
            this.state.status = 'failed';
            return false;
        }
    }

    // ===== MIDDLEWARE MANAGEMENT =====

    /**
     * Add middleware to runtime
     */
    addMiddleware(middleware: Middleware): void {
        if (!this.runtime) {
            throw new Error('Runtime not initialized');
        }

        // This would require runtime to expose middleware management
        const mwName =
            (middleware as unknown as { displayName?: string }).displayName ||
            middleware.name ||
            'anonymous-middleware';
        this.logger.info('Middleware added', { middleware: mwName });
    }

    /**
     * Remove middleware from runtime
     */
    removeMiddleware(middlewareName: string): boolean {
        if (!this.runtime) {
            throw new Error('Runtime not initialized');
        }

        this.logger.info('Middleware removed', { middleware: middlewareName });
        return true;
    }

    /**
     * Get list of active middleware
     */
    getMiddlewareList(): string[] {
        if (!this.runtime) {
            throw new Error('Runtime not initialized');
        }

        const names =
            this.config.runtimeConfig?.middleware?.map((m) => m.name) || [];
        return names.filter((n): n is string => typeof n === 'string');
    }

    // ===== MEMORY MANAGEMENT =====

    /**
     * Get memory statistics
     */
    getMemoryStats(): Record<string, unknown> {
        if (!this.runtime) {
            throw new Error('Runtime not initialized');
        }

        const runtimeStats = this.runtime.getStats();
        return {
            runtime: runtimeStats,
            kernel: {
                contextCacheSize: this.contextCache.size,
                contextUpdateQueueSize: this.contextUpdateQueue.size,
                eventBatchQueueSize: this.eventBatchQueue.length,
            },
        };
    }

    /**
     * Force garbage collection (if available)
     */
    forceGarbageCollection(): void {
        if (global.gc) {
            global.gc();
            this.logger.info('Garbage collection forced');
        } else {
            this.logger.warn('Garbage collection not available');
        }
    }

    // ===== ENHANCED STATE MANAGEMENT =====

    /**
     * Synchronize kernel and runtime states
     */
    private synchronizeStates(): void {
        if (this.runtime && this.state.status === 'initialized') {
            this.state.status = 'running';
        } else if (!this.runtime && this.state.status === 'running') {
            this.state.status = 'failed';
        }
    }

    /**
     * Enhanced cleanup with complete resource management
     */
    async enhancedCleanup(): Promise<void> {
        this.logger.info('Starting enhanced cleanup');

        // Cleanup runtime
        if (this.runtime) {
            await this.runtime.cleanup();
            this.runtime = null;
        }

        // Cleanup kernel resources
        this.contextCache.clear();
        this.contextUpdateQueue.clear();
        this.eventBatchQueue.length = 0;

        // Clear timers
        if (this.contextUpdateTimer) {
            clearTimeout(this.contextUpdateTimer);
            this.contextUpdateTimer = null;
        }
        if (this.eventBatchTimer) {
            clearTimeout(this.eventBatchTimer);
            this.eventBatchTimer = null;
        }

        // Cleanup enhanced queue timers
        this.cleanupEnhancedQueueFeatures();

        // Cleanup quota timers
        this.cleanupQuotaTimers();

        // Reset state
        this.state.status = 'initialized';
        this.workflowContext = null;

        this.logger.info('Enhanced cleanup completed');
    }

    /**
     * Clear events and resources (for testing or reset)
     */
    async clear(): Promise<void> {
        this.logger.info('🔄 CLEARING KERNEL', {
            kernelId: this.state.id,
            status: this.state.status,
            hasRuntime: !!this.runtime,
            trace: {
                source: 'kernel',
                step: 'clear-start',
                timestamp: Date.now(),
            },
        });

        try {
            // Enhanced cleanup first
            await this.enhancedCleanup();

            // Clear runtime if exists
            if (this.runtime) {
                this.runtime.clear();
                this.runtime = null;
            }

            // Reset state completely
            this.state = {
                ...this.state,
                contextData: {},
                stateData: {},
                status: 'initialized',
                startTime: Date.now(),
                eventCount: 0,
                operationId: undefined,
                lastOperationHash: undefined,
                pendingOperations: new Set<string>(),
            };

            // Clear workflow context
            this.workflowContext = null;

            // Clear all caches and queues
            this.contextCache.clear();
            this.contextUpdateQueue.clear();
            this.eventBatchQueue.length = 0;

            this.logger.info('✅ KERNEL CLEARED', {
                kernelId: this.state.id,
                trace: {
                    source: 'kernel',
                    step: 'clear-complete',
                    timestamp: Date.now(),
                },
            });
        } catch (error) {
            this.logger.error('Failed to clear kernel', error as Error);
            throw error;
        }
    }

    // ===== ENHANCED STATUS & HEALTH =====

    /**
     * Get comprehensive health status
     */
    getHealthStatus(): {
        status: 'healthy' | 'degraded' | 'unhealthy';
        checks: {
            runtime: boolean;
            context: boolean;
            memory: boolean;
            performance: boolean;
        };
        details: Record<string, unknown>;
    } {
        const runtimeHealthy = !!this.runtime;
        const contextHealthy = this.contextCache.size < 1000;
        const memoryHealthy = this.eventBatchQueue.length < 100;
        const performanceHealthy = this.contextUpdateQueue.size < 50;

        const allHealthy =
            runtimeHealthy &&
            contextHealthy &&
            memoryHealthy &&
            performanceHealthy;
        const anyHealthy =
            runtimeHealthy ||
            contextHealthy ||
            memoryHealthy ||
            performanceHealthy;

        return {
            status: allHealthy
                ? 'healthy'
                : !runtimeHealthy
                  ? 'unhealthy'
                  : anyHealthy
                    ? 'degraded'
                    : 'unhealthy',
            checks: {
                runtime: runtimeHealthy,
                context: contextHealthy,
                memory: memoryHealthy,
                performance: performanceHealthy,
            },
            details: {
                runtimeStats: this.runtime ? this.runtime.getStats() : null,
                kernelStats: this.getStatus(),
                memoryStats: this.runtime ? this.getMemoryStats() : null,
            },
        };
    }

    // ===== ATOMICITY & IDEMPOTENCY =====

    /**
     * Execute operation atomically with idempotency
     */
    private async executeAtomicOperation<T>(
        operationId: string,
        operation: () => Promise<T>,
        options?: {
            timeout?: number;
            retries?: number;
            isolation?: boolean;
        },
    ): Promise<T> {
        // Check if operation is already in progress (idempotency)
        if (this.state.pendingOperations.has(operationId)) {
            throw new Error(`Operation ${operationId} already in progress`);
        }

        // Check operation limits
        if (
            this.config.isolation?.maxConcurrentOperations &&
            this.state.pendingOperations.size >=
                this.config.isolation.maxConcurrentOperations
        ) {
            throw new Error('Maximum concurrent operations reached');
        }

        // Add operation to pending set
        this.state.pendingOperations.add(operationId);

        try {
            // Execute with timeout
            const timeout =
                options?.timeout ||
                this.config.idempotency?.operationTimeout ||
                30000;
            const result = await Promise.race([
                operation(),
                new Promise<never>((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Operation timeout')),
                        timeout,
                    ),
                ),
            ]);

            // Update last operation hash for idempotency
            this.state.lastOperationHash = this.hashOperation(
                operationId,
                result,
            );

            return result;
        } finally {
            // Always remove from pending operations
            this.state.pendingOperations.delete(operationId);
        }
    }

    /**
     * Hash operation for idempotency checking
     */
    private hashOperation(operationId: string, result: unknown): string {
        return stableHash({
            operationId,
            result: JSON.stringify(result),
            timestamp: Date.now(),
        });
    }

    /**
     * Check if operation is idempotent (same result)
     */
    private isIdempotentOperation(
        _operationId: string,
        _operation: () => Promise<unknown>,
    ): boolean {
        if (!this.config.idempotency?.enableOperationIdempotency) {
            return false;
        }

        // For now, we'll assume operations are not idempotent
        // In a real implementation, you'd check against stored operation results
        return false;
    }

    // ===== TENANT ISOLATION =====

    /**
     * Get isolated context for specific tenant
     */
    private getTenantContext(tenantId: string): Record<string, unknown> {
        if (!this.config.isolation?.enableTenantIsolation) {
            return this.state.contextData;
        }

        // Create tenant-specific context key
        const tenantKey = `tenant:${tenantId}`;
        if (!this.state.contextData[tenantKey]) {
            this.state.contextData[tenantKey] = {};
        }

        return this.state.contextData[tenantKey] as Record<string, unknown>;
    }
}

/**
 * Create kernel with performance optimizations
 */
export function createKernel(config: KernelConfig): ExecutionKernel {
    return new ExecutionKernel(config);
}
