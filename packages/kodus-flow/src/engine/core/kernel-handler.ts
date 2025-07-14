/**
 * @module engine/kernel-handler
 * @description Handler centralizado para comunicação com Kernel
 *
 * Interface única para todos os componentes do Engine:
 * - Agents
 * - Tools
 * - Workflows
 * - Multi-agent systems
 *
 * Responsabilidades:
 * - Gerenciar conexão com Kernel
 * - Fornecer métodos padronizados
 * - Abstrair complexidade do Kernel
 * - Garantir consistência na comunicação
 *
 * IMPORTANTE: KernelHandler só fala com Kernel, não com Runtime diretamente
 */

import { createKernel, type ExecutionKernel } from '../../kernel/index.js';
import { createLogger } from '../../observability/index.js';

import type { KernelConfig } from '../../kernel/kernel.js';
import type { Middleware } from '../../runtime/middleware/types.js';
import { AnyEvent, EventType } from '../../core/types/events.js';
import {
    createWorkflow,
    EventHandler,
    Workflow,
    WorkflowContext,
} from '../../core/types/common-types.js';
import {
    createCircuitBreaker,
    type CircuitBreaker,
} from '../old/circuit-breaker.js';
import { ExecutionId } from '../../core/types/base-types.js';
import { IdGenerator } from '../../utils/id-generator.js';

/**
 * Resultado de execução (migrado do ExecutionEngine)
 */
export interface ExecutionResult<T = unknown> {
    status: 'completed' | 'failed' | 'paused';
    data?: T;
    error?: {
        message: string;
        details?: unknown;
    };
    metadata: {
        executionId: ExecutionId;
        duration: number;
        eventCount: number;
        snapshotId?: string;
    };
}

/**
 * Configuração do KernelHandler
 */
export interface KernelHandlerConfig {
    tenantId: string;
    debug?: boolean;
    monitor?: boolean;

    // Kernel configuration
    kernelConfig?: Partial<KernelConfig>;

    // Runtime configuration (passado para o Kernel)
    runtimeConfig?: {
        queueSize?: number;
        batchSize?: number;
        middleware?: Middleware[];
    };

    // Performance (passado para o Kernel)
    performance?: {
        enableBatching?: boolean;
        enableCaching?: boolean;
        enableLazyLoading?: boolean;
    };

    // Infinite loop protection
    loopProtection?: {
        enabled?: boolean;
        maxEventCount?: number;
        maxEventRate?: number;
        windowSize?: number;
        circuitBreakerConfig?: {
            failureThreshold?: number;
            timeout?: number;
            resetTimeout?: number;
        };
    };
}

/**
 * Interface para comunicação com Kernel
 */
export interface KernelHandlerInterface {
    // Lifecycle
    initialize(): Promise<void>;
    isInitialized(): boolean;
    cleanup(): Promise<void>;

    // Context management (via Kernel)
    getContext<T = unknown>(namespace: string, key: string): T | undefined;
    setContext(namespace: string, key: string, value: unknown): void;
    incrementContext(namespace: string, key: string, delta?: number): number;

    // Event management (via Kernel → Runtime)
    emit<T extends EventType>(eventType: T, data?: unknown): void;
    on<T extends AnyEvent>(eventType: string, handler: EventHandler<T>): void;
    off(eventType: string, handler: EventHandler<AnyEvent>): void;

    // Stream processing (via Kernel → Runtime)
    createStream<S extends AnyEvent>(
        generator: () => AsyncGenerator<S>,
    ): unknown;

    // Workflow management
    registerWorkflow(workflow: Workflow): void;
    getWorkflowContext(): WorkflowContext | null;

    // State management (via Kernel)
    pause(reason?: string): Promise<string>;
    resume(snapshotId: string): Promise<void>;
    getStatus(): Record<string, unknown>;

    // Direct access (apenas Kernel, não Runtime)
    getKernel(): ExecutionKernel | null;

    // Execution methods (migrados do ExecutionEngine)
    run(startEvent: AnyEvent): Promise<ExecutionResult>;
    getExecutionStatus(): {
        executionId: ExecutionId;
        tenantId: string;
        status: Record<string, unknown>;
        uptime: number;
    };
}

/**
 * KernelHandler - Interface centralizada para comunicação com Kernel
 */
export class KernelHandler implements KernelHandlerInterface {
    private kernel: ExecutionKernel | null = null;
    private workflowContext: WorkflowContext | null = null;
    private logger = createLogger('KernelHandler');
    private config: KernelHandlerConfig;
    private initialized = false;

    // Handlers registrados localmente (serão passados para o Kernel)
    private handlers = new Map<string, EventHandler<AnyEvent>[]>();

    // Infinite loop protection
    private loopProtection: {
        enabled: boolean;
        maxEventCount: number;
        maxEventRate: number;
        windowSize: number;
        eventHistory: Array<{ timestamp: number; type: string }>;
        circuitBreaker: CircuitBreaker;
    };

    constructor(config: KernelHandlerConfig) {
        this.config = {
            debug: false,
            monitor: false,
            ...config,
        };

        // Initialize loop protection
        const loopConfig = config.loopProtection || {};
        this.loopProtection = {
            enabled: loopConfig.enabled ?? true,
            maxEventCount: loopConfig.maxEventCount ?? 100,
            maxEventRate: loopConfig.maxEventRate ?? 50, // events per second
            windowSize: loopConfig.windowSize ?? 5000, // 5 seconds
            eventHistory: [],
            circuitBreaker: createCircuitBreaker(
                `kernel-handler-${config.tenantId}`,
                {
                    failureThreshold:
                        loopConfig.circuitBreakerConfig?.failureThreshold ?? 5,
                    failureRateThreshold: 0.8,
                    requestVolumeThreshold: 10,
                    timeout: loopConfig.circuitBreakerConfig?.timeout ?? 10000,
                    resetTimeout:
                        loopConfig.circuitBreakerConfig?.resetTimeout ?? 30000,
                    cooldownPeriod: 60000,
                    successThreshold: 3,
                    slowCallDurationThreshold: 5000,
                    slowCallRateThreshold: 0.7,
                },
            ),
        };

        this.logger.info('KernelHandler created', {
            tenantId: config.tenantId,
            debug: this.config.debug,
            loopProtection: this.loopProtection.enabled,
        });
    }

    /**
     * Inicializar Kernel
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            this.logger.warn('KernelHandler already initialized');
            return;
        }

        try {
            // 1. Criar workflow padrão para inicialização
            const defaultWorkflow = createWorkflow(
                {
                    name: 'kernel-handler-default',
                    description:
                        'Default workflow for KernelHandler initialization',
                    steps: {},
                    entryPoints: [],
                },
                {
                    tenantId: this.config.tenantId,
                },
            );

            // 2. Criar kernel
            this.kernel = createKernel({
                tenantId: this.config.tenantId,
                workflow: defaultWorkflow,
                debug: this.config.debug,
                monitor: this.config.monitor,
                runtimeConfig: this.config.runtimeConfig,
                performance: this.config.performance,
                ...this.config.kernelConfig,
            });

            // 3. Inicializar kernel
            this.workflowContext = await this.kernel.initialize();

            this.initialized = true;

            this.logger.info('KernelHandler initialized successfully', {
                tenantId: this.config.tenantId,
                kernelId: this.kernel.getStatus().id,
            });
        } catch (error) {
            this.logger.error(
                'Failed to initialize KernelHandler',
                error as Error,
            );
            throw error;
        }
    }

    /**
     * Verificar se está inicializado
     */
    isInitialized(): boolean {
        return this.initialized && this.kernel !== null;
    }

    /**
     * Cleanup de recursos
     */
    async cleanup(): Promise<void> {
        if (!this.initialized) {
            return;
        }

        try {
            if (this.kernel) {
                await this.kernel.complete();
            }

            this.kernel = null;
            this.workflowContext = null;
            this.initialized = false;
            this.handlers.clear();

            // Reset loop protection
            this.loopProtection.eventHistory = [];
            this.loopProtection.circuitBreaker.reset();

            this.logger.info('KernelHandler cleaned up');
        } catch (error) {
            this.logger.error(
                'Failed to cleanup KernelHandler',
                error as Error,
            );
            throw error;
        }
    }

    /**
     * Context Management (via Kernel)
     */
    getContext<T = unknown>(namespace: string, key: string): T | undefined {
        this.ensureInitialized();
        return this.kernel!.getContext<T>(namespace, key);
    }

    setContext(namespace: string, key: string, value: unknown): void {
        this.ensureInitialized();
        this.kernel!.setContext(namespace, key, value);
    }

    incrementContext(
        namespace: string,
        key: string,
        delta: number = 1,
    ): number {
        this.ensureInitialized();
        return this.kernel!.incrementContext(namespace, key, delta);
    }

    /**
     * Event Management (via Kernel → Runtime)
     */
    emit<T extends EventType>(eventType: T, data?: unknown): void {
        this.ensureInitialized();

        // Check for infinite loop protection
        if (this.loopProtection.enabled) {
            this.checkForInfiniteLoop(eventType);
        }

        // Enviar evento via Kernel (que repassa para Runtime)
        const event = {
            id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: eventType,
            threadId: `kernel-${Date.now()}`,
            data,
            ts: Date.now(),
        };

        // Execute with circuit breaker protection
        this.loopProtection.circuitBreaker
            .execute(
                async () => {
                    this.kernel!.run(event);
                    return true;
                },
                {
                    resourceName: 'kernel-handler',
                    operation: 'emit-event',
                    metadata: { eventType, tenantId: this.config.tenantId },
                },
            )
            .catch((error) => {
                this.logger.error('Failed to emit event', error as Error, {
                    eventType,
                    circuitState: this.loopProtection.circuitBreaker.getState(),
                });
                throw error;
            });
    }

    on<T extends AnyEvent>(eventType: string, handler: EventHandler<T>): void {
        this.ensureInitialized();

        // Registrar handler localmente
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, []);
        }
        this.handlers.get(eventType)!.push(handler as EventHandler<AnyEvent>);

        // O Kernel já tem acesso ao Runtime e pode registrar handlers
        // Aqui poderíamos implementar um mecanismo para passar handlers para o Kernel
        this.logger.debug('Handler registered', { eventType });
    }

    off(eventType: string, handler: EventHandler<AnyEvent>): void {
        this.ensureInitialized();

        const eventHandlers = this.handlers.get(eventType);
        if (eventHandlers) {
            const index = eventHandlers.indexOf(handler);
            if (index > -1) {
                eventHandlers.splice(index, 1);
            }
        }

        this.logger.debug('Handler unregistered', { eventType });
    }

    /**
     * Stream Processing (via Kernel → Runtime)
     */
    createStream<S extends AnyEvent>(
        generator: () => AsyncGenerator<S>,
    ): unknown {
        this.ensureInitialized();

        // O Kernel tem acesso ao Runtime, então podemos pedir para ele criar o stream
        // Por enquanto, retornamos um stream mock que será conectado via Kernel
        const self = {
            [Symbol.asyncIterator]: generator,
            filter: () => self,
            map: () => self,
            until: () => self,
            takeUntil: () => self,
            toArray: () => Promise.resolve([]),
            withMiddleware: () => self,
            debounce: () => self,
            throttle: () => self,
            batch: () => self,
            merge: () => self,
            combineLatest: () => self,
        };

        return self;
    }

    /**
     * Workflow Management
     */
    registerWorkflow(workflow: Workflow): void {
        this.ensureInitialized();

        // Registrar workflow no Kernel
        this.logger.info('Workflow registered', {
            workflowName: workflow.createContext?.()?.executionId || 'unknown',
        });
    }

    getWorkflowContext(): WorkflowContext | null {
        return this.workflowContext;
    }

    /**
     * State Management (via Kernel)
     */
    async pause(reason: string = 'manual'): Promise<string> {
        this.ensureInitialized();
        return await this.kernel!.pause(reason);
    }

    async resume(snapshotId: string): Promise<void> {
        this.ensureInitialized();
        await this.kernel!.resume(snapshotId);
    }

    getStatus(): Record<string, unknown> {
        this.ensureInitialized();
        return {
            kernel: this.kernel!.getStatus(),
            handlers: Array.from(this.handlers.keys()),
            initialized: this.initialized,
            loopProtection: {
                enabled: this.loopProtection.enabled,
                eventCount: this.loopProtection.eventHistory.length,
                eventRate:
                    this.loopProtection.eventHistory.length /
                    (this.loopProtection.windowSize / 1000),
                circuitBreakerState:
                    this.loopProtection.circuitBreaker.getState(),
                circuitBreakerMetrics:
                    this.loopProtection.circuitBreaker.getMetrics(),
            },
        };
    }

    /**
     * Direct Access (apenas Kernel, não Runtime)
     */
    getKernel(): ExecutionKernel | null {
        return this.kernel;
    }

    /**
     * Executa workflow com evento inicial (migrado do ExecutionEngine)
     */
    async run(startEvent: AnyEvent): Promise<ExecutionResult> {
        this.ensureInitialized();

        const execId = IdGenerator.executionId() as ExecutionId;
        const startTime = Date.now();

        this.logger.info('KernelHandler starting execution', {
            executionId: execId,
            eventType: startEvent.type,
            tenantId: this.config.tenantId,
        });

        try {
            // Emitir evento inicial
            this.emit(startEvent.type, startEvent.data);

            // Processar eventos via kernel
            if (this.kernel) {
                await this.kernel.run(startEvent);
            }

            const duration = Date.now() - startTime;
            const status = this.kernel?.getStatus() || { eventCount: 0 };

            this.logger.info('KernelHandler completed successfully', {
                executionId: execId,
                duration,
                eventCount: status.eventCount,
            });

            return {
                status: 'completed',
                data: startEvent.data,
                metadata: {
                    executionId: execId,
                    duration,
                    eventCount: status.eventCount || 0,
                },
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : 'Unknown execution error';

            this.logger.error('KernelHandler failed', error as Error, {
                executionId: execId,
                duration,
            });

            return {
                status: 'failed',
                error: {
                    message: errorMessage,
                    details: error,
                },
                metadata: {
                    executionId: execId,
                    duration,
                    eventCount: 0,
                },
            };
        }
    }

    /**
     * Obtém status da execução (migrado do ExecutionEngine)
     */
    getExecutionStatus() {
        const execId = IdGenerator.executionId() as ExecutionId;
        const startTime = Date.now();

        return {
            executionId: execId,
            tenantId: this.config.tenantId,
            status: this.kernel?.getStatus() || {},
            uptime: Date.now() - startTime,
        };
    }

    /**
     * Get loop protection metrics
     */
    getLoopProtectionMetrics(): {
        enabled: boolean;
        eventCount: number;
        eventRate: number;
        maxEventCount: number;
        maxEventRate: number;
        windowSize: number;
        circuitBreakerState: string;
        recentEvents: Array<{ timestamp: number; type: string }>;
    } {
        return {
            enabled: this.loopProtection.enabled,
            eventCount: this.loopProtection.eventHistory.length,
            eventRate:
                this.loopProtection.eventHistory.length /
                (this.loopProtection.windowSize / 1000),
            maxEventCount: this.loopProtection.maxEventCount,
            maxEventRate: this.loopProtection.maxEventRate,
            windowSize: this.loopProtection.windowSize,
            circuitBreakerState: this.loopProtection.circuitBreaker.getState(),
            recentEvents: this.loopProtection.eventHistory.slice(-10),
        };
    }

    /**
     * Reset loop protection (for testing or recovery)
     */
    resetLoopProtection(): void {
        this.loopProtection.eventHistory = [];
        this.loopProtection.circuitBreaker.reset();
        this.logger.info('Loop protection reset');
    }

    /**
     * Enable/disable loop protection
     */
    setLoopProtectionEnabled(enabled: boolean): void {
        this.loopProtection.enabled = enabled;
        this.logger.info('Loop protection toggled', { enabled });
    }

    /**
     * Métodos auxiliares
     */
    private ensureInitialized(): void {
        if (!this.isInitialized()) {
            throw new Error(
                'KernelHandler not initialized. Call initialize() first.',
            );
        }
    }

    /**
     * Check for infinite loop patterns
     */
    private checkForInfiniteLoop(eventType: string): void {
        const now = Date.now();
        const cutoffTime = now - this.loopProtection.windowSize;

        // Clean up old events outside the window
        this.loopProtection.eventHistory =
            this.loopProtection.eventHistory.filter(
                (event) => event.timestamp > cutoffTime,
            );

        // Add current event
        this.loopProtection.eventHistory.push({
            timestamp: now,
            type: eventType,
        });

        // Check event count threshold
        if (
            this.loopProtection.eventHistory.length >
            this.loopProtection.maxEventCount
        ) {
            const error = new Error(
                `Infinite loop detected: ${this.loopProtection.eventHistory.length} events in ${this.loopProtection.windowSize}ms window`,
            );
            this.logger.error('Infinite loop protection triggered', error, {
                eventType,
                eventCount: this.loopProtection.eventHistory.length,
                windowSize: this.loopProtection.windowSize,
                recentEvents: this.loopProtection.eventHistory.slice(-10),
            });
            throw error;
        }

        // Check event rate threshold
        const eventRate =
            this.loopProtection.eventHistory.length /
            (this.loopProtection.windowSize / 1000);
        if (eventRate > this.loopProtection.maxEventRate) {
            this.logger.warn('High event rate detected', {
                eventType,
                eventRate: eventRate.toFixed(2),
                maxEventRate: this.loopProtection.maxEventRate,
                eventCount: this.loopProtection.eventHistory.length,
                message: `High event rate detected: ${eventRate.toFixed(2)} events/sec (max: ${this.loopProtection.maxEventRate})`,
            });
            // Don't throw here, just warn - high rate might be legitimate
        }

        // Check for repeating event patterns
        this.checkForRepeatingPatterns(eventType);
    }

    /**
     * Check for repeating event patterns that might indicate loops
     */
    private checkForRepeatingPatterns(eventType: string): void {
        const recentEvents = this.loopProtection.eventHistory.slice(-20); // Last 20 events
        const sameTypeEvents = recentEvents.filter(
            (event) => event.type === eventType,
        );

        // If more than 70% of recent events are the same type, it might be a loop
        if (sameTypeEvents.length > 14 && recentEvents.length >= 20) {
            this.logger.warn('Potential loop pattern detected', {
                eventType,
                sameTypeCount: sameTypeEvents.length,
                totalRecentEvents: recentEvents.length,
                percentage: Math.round(
                    (sameTypeEvents.length / recentEvents.length) * 100,
                ),
            });
        }

        // Check for alternating patterns (A-B-A-B-A-B...)
        if (recentEvents.length >= 6) {
            const lastSix = recentEvents.slice(-6).map((e) => e.type);
            const isAlternating =
                lastSix[0] === lastSix[2] &&
                lastSix[2] === lastSix[4] &&
                lastSix[1] === lastSix[3] &&
                lastSix[3] === lastSix[5] &&
                lastSix[0] !== lastSix[1];

            if (isAlternating) {
                this.logger.warn('Alternating event pattern detected', {
                    pattern: lastSix,
                    eventType,
                });
            }
        }
    }
}

/**
 * Factory para criar KernelHandler
 */
export function createKernelHandler(
    config: KernelHandlerConfig,
): KernelHandler {
    return new KernelHandler(config);
}

/**
 * Create KernelHandler with default loop protection
 */
export function createKernelHandlerWithLoopProtection(
    config: Omit<KernelHandlerConfig, 'loopProtection'> & {
        loopProtection?: Partial<KernelHandlerConfig['loopProtection']>;
    },
): KernelHandler {
    const defaultLoopProtection = {
        enabled: true,
        maxEventCount: 100,
        maxEventRate: 50,
        windowSize: 5000,
        circuitBreakerConfig: {
            failureThreshold: 5,
            timeout: 10000,
            resetTimeout: 30000,
        },
    };

    return new KernelHandler({
        ...config,
        loopProtection: {
            ...defaultLoopProtection,
            ...config.loopProtection,
        },
    });
}

export function createGlobalKernelHandler(
    config: KernelHandlerConfig,
): KernelHandler {
    return createKernelHandler(config); // Return new instance instead of singleton
}
