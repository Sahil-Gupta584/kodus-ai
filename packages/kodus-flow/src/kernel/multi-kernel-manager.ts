/**
 * @module kernel/multi-kernel-manager
 * @description Multi-Kernel Architecture with Namespace Isolation
 */

import { ExecutionKernel, createKernel, type KernelConfig } from './kernel.js';
import { createPersistor } from './persistor.js';
import { createLogger } from '../observability/index.js';
import type {
    EventType,
    EventPayloads,
    AnyEvent,
} from '../core/types/events.js';
import type { EventHandler } from '../core/types/common-types.js';
import type { Workflow } from '../core/types/workflow-types.js';

/**
 * Kernel specification for different purposes
 */
export interface KernelSpec {
    /** Kernel identifier */
    kernelId: string;
    /** Namespace for event isolation */
    namespace: string;
    /** Purpose-specific workflow */
    workflow: Workflow;
    /** Whether this kernel needs persistence (agents=true, logs=false) */
    needsPersistence: boolean;
    /** Whether this kernel needs snapshots for recovery */
    needsSnapshots: boolean;
    /** Quotas for this kernel (null for observability kernels) */
    quotas?: KernelConfig['quotas'];
    /** Performance configuration */
    performance?: KernelConfig['performance'];
    /** Runtime configuration */
    runtimeConfig?: KernelConfig['runtimeConfig'];
}

/**
 * Cross-kernel event bridge configuration
 */
export interface CrossKernelBridge {
    /** Source kernel namespace */
    fromNamespace: string;
    /** Target kernel namespace */
    toNamespace: string;
    /** Event type pattern to bridge (e.g., "metrics.*") */
    eventPattern: string;
    /** Transform function for cross-kernel events */
    transform?: (event: AnyEvent) => AnyEvent;
    /** Whether to log cross-kernel communications */
    enableLogging?: boolean;
}

/**
 * Multi-kernel manager configuration
 */
export interface MultiKernelConfig {
    /** Tenant ID for all kernels */
    tenantId: string;
    /** Kernel specifications */
    kernels: KernelSpec[];
    /** Cross-kernel communication bridges */
    bridges?: CrossKernelBridge[];
    /** Global configuration */
    global?: {
        /** Base persistor type for kernels that need persistence */
        persistorType?: 'memory' | 'redis';
        /** Enable cross-kernel event logging */
        enableCrossKernelLogging?: boolean;
        /** Maximum concurrent kernels */
        maxConcurrentKernels?: number;
    };
}

/**
 * Kernel instance with metadata
 */
interface ManagedKernel {
    spec: KernelSpec;
    instance: ExecutionKernel | null;
    status: 'initializing' | 'running' | 'paused' | 'failed' | 'stopped';
    startTime: number;
    lastActivity: number;
    eventCount: number;
}

/**
 * Multi-Kernel Manager
 *
 * Manages multiple isolated kernels within the same tenant:
 * - Agent execution kernels (with persistence & snapshots)
 * - Observability kernels (fire-and-forget, no persistence)
 * - Cross-kernel communication via event bridges
 * - Namespace isolation with controlled communication
 */
export class MultiKernelManager {
    private readonly config: MultiKernelConfig;
    private readonly logger: ReturnType<typeof createLogger>;
    private readonly kernels = new Map<string, ManagedKernel>();
    private readonly eventBridges = new Map<string, CrossKernelBridge>();
    private readonly crossKernelEventLog: Array<{
        timestamp: number;
        from: string;
        to: string;
        eventType: string;
        success: boolean;
    }> = [];

    constructor(config: MultiKernelConfig) {
        this.config = config;
        this.logger = createLogger(`multi-kernel:${config.tenantId}`);

        // Register event bridges
        if (config.bridges) {
            for (const bridge of config.bridges) {
                const bridgeKey = `${bridge.fromNamespace}->${bridge.toNamespace}`;
                this.eventBridges.set(bridgeKey, bridge);
            }
        }

        this.logger.info('MultiKernelManager initialized', {
            tenantId: config.tenantId,
            kernelCount: config.kernels.length,
            bridgeCount: config.bridges?.length || 0,
        });
    }

    /**
     * Initialize all kernels
     */
    async initialize(): Promise<void> {
        const initPromises = this.config.kernels.map((spec) =>
            this.initializeKernel(spec),
        );

        await Promise.all(initPromises);

        this.logger.info('All kernels initialized', {
            kernelCount: this.kernels.size,
            runningKernels: Array.from(this.kernels.values()).filter(
                (k) => k.status === 'running',
            ).length,
        });
    }

    /**
     * Initialize a single kernel based on its specification
     */
    private async initializeKernel(spec: KernelSpec): Promise<void> {
        try {
            this.logger.info('Initializing kernel', {
                kernelId: spec.kernelId,
                namespace: spec.namespace,
                needsPersistence: spec.needsPersistence,
                needsSnapshots: spec.needsSnapshots,
            });

            // Create kernel configuration
            const kernelConfig: KernelConfig = {
                tenantId: this.config.tenantId,
                jobId: `${spec.namespace}-${spec.kernelId}`,
                workflow: spec.workflow,

                // Persistence only for kernels that need it (agents=yes, logs=no)
                persistor: spec.needsPersistence
                    ? createPersistor(
                          this.config.global?.persistorType || 'memory',
                      )
                    : undefined,

                // Runtime configuration with queue settings
                runtimeConfig: {
                    enableAcks: spec.needsPersistence,
                    ...(spec.runtimeConfig || {}),
                },

                // Quotas (null for observability kernels)
                quotas: spec.quotas,

                // Performance configuration
                performance: {
                    enableBatching: true,
                    enableCaching: spec.needsPersistence, // Cache only for persistent kernels
                    enableLazyLoading: !spec.needsPersistence, // Lazy load for logs
                    ...spec.performance,
                },

                // Isolation configuration
                isolation: {
                    enableTenantIsolation: true,
                    enableEventIsolation: true,
                    enableContextIsolation: true,
                },

                // Idempotency (only for persistent kernels)
                idempotency: spec.needsPersistence
                    ? {
                          enableOperationIdempotency: true,
                          enableEventIdempotency: true,
                      }
                    : undefined,
            };

            // Create kernel instance
            const kernel = createKernel(kernelConfig);

            // Initialize kernel
            const workflowContext = await kernel.initialize();

            // Register cross-kernel event handlers
            this.setupCrossKernelCommunication(spec, kernel);

            // Store managed kernel
            const managedKernel: ManagedKernel = {
                spec,
                instance: kernel,
                status: 'running',
                startTime: Date.now(),
                lastActivity: Date.now(),
                eventCount: 0,
            };

            this.kernels.set(spec.kernelId, managedKernel);

            this.logger.info('Kernel initialized successfully', {
                kernelId: spec.kernelId,
                namespace: spec.namespace,
                workflowName: workflowContext.workflowName,
            });
        } catch (error) {
            this.logger.error('Failed to initialize kernel', error as Error, {
                kernelId: spec.kernelId,
                namespace: spec.namespace,
            });

            // Store failed kernel for monitoring
            const managedKernel: ManagedKernel = {
                spec,
                instance: null, // Will be null for failed kernels
                status: 'failed',
                startTime: Date.now(),
                lastActivity: Date.now(),
                eventCount: 0,
            };

            this.kernels.set(spec.kernelId, managedKernel);
            throw error;
        }
    }

    /**
     * Setup cross-kernel communication for a kernel
     */
    private setupCrossKernelCommunication(
        spec: KernelSpec,
        kernel: ExecutionKernel,
    ): void {
        // Register handlers for events that should be bridged to other kernels
        kernel.registerHandler('*' as EventType, async (event: AnyEvent) => {
            await this.handleCrossKernelEvent(spec.namespace, event);
        });
    }

    /**
     * Handle cross-kernel event propagation
     */
    private async handleCrossKernelEvent(
        sourceNamespace: string,
        event: AnyEvent,
    ): Promise<void> {
        for (const [, bridge] of this.eventBridges) {
            if (bridge.fromNamespace !== sourceNamespace) continue;

            // Check if event matches the bridge pattern
            if (!this.matchesEventPattern(event.type, bridge.eventPattern))
                continue;

            try {
                // Transform event if needed
                const targetEvent = bridge.transform
                    ? bridge.transform(event)
                    : event;

                // Find target kernel
                const targetKernel = this.findKernelByNamespace(
                    bridge.toNamespace,
                );
                if (!targetKernel) {
                    this.logger.warn('Target kernel not found for bridge', {
                        bridge: `${bridge.fromNamespace}->${bridge.toNamespace}`,
                        eventType: event.type,
                    });
                    continue;
                }

                // Send event to target kernel
                if (targetKernel.instance) {
                    await targetKernel.instance.emitEventAsync(
                        targetEvent.type as EventType,
                        targetEvent.data,
                        {
                            correlationId: event.metadata?.correlationId,
                            tenantId: this.config.tenantId,
                        },
                    );
                }

                // Log cross-kernel communication
                if (
                    bridge.enableLogging ||
                    this.config.global?.enableCrossKernelLogging
                ) {
                    this.crossKernelEventLog.push({
                        timestamp: Date.now(),
                        from: sourceNamespace,
                        to: bridge.toNamespace,
                        eventType: event.type,
                        success: true,
                    });
                }

                this.logger.debug('Cross-kernel event bridged', {
                    from: sourceNamespace,
                    to: bridge.toNamespace,
                    eventType: event.type,
                    eventId: event.id,
                });
            } catch (error) {
                this.logger.error(
                    'Failed to bridge cross-kernel event',
                    error as Error,
                    {
                        from: sourceNamespace,
                        to: bridge.toNamespace,
                        eventType: event.type,
                    },
                );

                // Log failed communication
                this.crossKernelEventLog.push({
                    timestamp: Date.now(),
                    from: sourceNamespace,
                    to: bridge.toNamespace,
                    eventType: event.type,
                    success: false,
                });
            }
        }
    }

    /**
     * Check if event type matches pattern
     */
    private matchesEventPattern(eventType: string, pattern: string): boolean {
        if (pattern === '*') return true;
        if (pattern.endsWith('*')) {
            const prefix = pattern.slice(0, -1);
            return eventType.startsWith(prefix);
        }
        return eventType === pattern;
    }

    /**
     * Find kernel by namespace
     */
    private findKernelByNamespace(
        namespace: string,
    ): ManagedKernel | undefined {
        for (const kernel of this.kernels.values()) {
            if (
                kernel.spec.namespace === namespace &&
                kernel.status === 'running'
            ) {
                return kernel;
            }
        }
        return undefined;
    }

    /**
     * Get kernel by ID
     */
    getKernel(kernelId: string): ExecutionKernel | null {
        const managedKernel = this.kernels.get(kernelId);
        return managedKernel?.status === 'running'
            ? managedKernel.instance
            : null;
    }

    /**
     * Get kernel by namespace
     */
    getKernelByNamespace(namespace: string): ExecutionKernel | null {
        const managedKernel = this.findKernelByNamespace(namespace);
        return managedKernel?.instance || null;
    }

    /**
     * Emit event to specific kernel
     */
    async emitToKernel<T extends EventType>(
        kernelId: string,
        eventType: T,
        data?: EventPayloads[T],
    ): Promise<void> {
        const kernel = this.getKernel(kernelId);
        if (!kernel) {
            throw new Error(`Kernel not found or not running: ${kernelId}`);
        }

        await kernel.emitEventAsync(eventType, data, {
            tenantId: this.config.tenantId,
        });

        // Update activity
        const managedKernel = this.kernels.get(kernelId);
        if (managedKernel) {
            managedKernel.lastActivity = Date.now();
            managedKernel.eventCount++;
        }
    }

    /**
     * Emit event to kernel by namespace
     */
    async emitToNamespace<T extends EventType>(
        namespace: string,
        eventType: T,
        data?: EventPayloads[T],
    ): Promise<void> {
        const kernel = this.getKernelByNamespace(namespace);
        if (!kernel) {
            throw new Error(`Kernel not found for namespace: ${namespace}`);
        }

        await kernel.emitEventAsync(eventType, data, {
            tenantId: this.config.tenantId,
        });
    }

    /**
     * Register handler on specific kernel
     */
    registerHandler(
        kernelId: string,
        eventType: EventType,
        handler: EventHandler<AnyEvent>,
    ): void {
        const kernel = this.getKernel(kernelId);
        if (!kernel) {
            throw new Error(`Kernel not found or not running: ${kernelId}`);
        }

        kernel.registerHandler(eventType, handler);
    }

    /**
     * Process events for all running kernels
     */
    async processAllKernels(): Promise<void> {
        const processPromises = Array.from(this.kernels.values())
            .filter((k) => k.status === 'running')
            .map(async (managedKernel) => {
                try {
                    if (managedKernel.instance) {
                        await managedKernel.instance.processEvents();
                        managedKernel.lastActivity = Date.now();
                    }
                } catch (error) {
                    this.logger.error(
                        'Failed to process events for kernel',
                        error as Error,
                        {
                            kernelId: managedKernel.spec.kernelId,
                        },
                    );
                }
            });

        await Promise.all(processPromises);
    }

    /**
     * Get comprehensive status of all kernels
     */
    getStatus(): {
        tenantId: string;
        kernelCount: number;
        runningKernels: number;
        failedKernels: number;
        kernels: Array<{
            kernelId: string;
            namespace: string;
            status: string;
            startTime: number;
            lastActivity: number;
            eventCount: number;
            needsPersistence: boolean;
            needsSnapshots: boolean;
        }>;
        crossKernelEvents: {
            totalEvents: number;
            successfulEvents: number;
            failedEvents: number;
            recentEvents: Array<{
                timestamp: number;
                from: string;
                to: string;
                eventType: string;
                success: boolean;
            }>;
        };
    } {
        const kernels = Array.from(this.kernels.values());
        const runningKernels = kernels.filter(
            (k) => k.status === 'running',
        ).length;
        const failedKernels = kernels.filter(
            (k) => k.status === 'failed',
        ).length;

        const successfulCrossKernelEvents = this.crossKernelEventLog.filter(
            (e) => e.success,
        ).length;
        const failedCrossKernelEvents = this.crossKernelEventLog.filter(
            (e) => !e.success,
        ).length;

        return {
            tenantId: this.config.tenantId,
            kernelCount: kernels.length,
            runningKernels,
            failedKernels,
            kernels: kernels.map((k) => ({
                kernelId: k.spec.kernelId,
                namespace: k.spec.namespace,
                status: k.status,
                startTime: k.startTime,
                lastActivity: k.lastActivity,
                eventCount: k.eventCount,
                needsPersistence: k.spec.needsPersistence,
                needsSnapshots: k.spec.needsSnapshots,
            })),
            crossKernelEvents: {
                totalEvents: this.crossKernelEventLog.length,
                successfulEvents: successfulCrossKernelEvents,
                failedEvents: failedCrossKernelEvents,
                recentEvents: this.crossKernelEventLog.slice(-10), // Last 10 events
            },
        };
    }

    /**
     * Pause all kernels (creates snapshots for persistent kernels)
     */
    async pauseAll(): Promise<Map<string, string | null>> {
        const results = new Map<string, string | null>();

        for (const [kernelId, managedKernel] of this.kernels) {
            if (managedKernel.status !== 'running') continue;

            try {
                // Only create snapshots for kernels that need them
                if (
                    managedKernel.spec.needsSnapshots &&
                    managedKernel.instance
                ) {
                    const snapshotId =
                        await managedKernel.instance.pause(
                            `multi-kernel-pause`,
                        );
                    results.set(kernelId, snapshotId);
                } else {
                    // For non-persistent kernels (like logs), just stop processing
                    results.set(kernelId, null);
                }

                managedKernel.status = 'paused';
            } catch (error) {
                this.logger.error('Failed to pause kernel', error as Error, {
                    kernelId,
                });
                results.set(kernelId, null);
            }
        }

        return results;
    }

    /**
     * Resume all kernels (restores from snapshots for persistent kernels)
     */
    async resumeAll(snapshotIds?: Map<string, string>): Promise<void> {
        for (const [kernelId, managedKernel] of this.kernels) {
            if (managedKernel.status !== 'paused') continue;

            try {
                // Only restore from snapshots for kernels that need them
                if (
                    managedKernel.spec.needsSnapshots &&
                    snapshotIds?.has(kernelId) &&
                    managedKernel.instance
                ) {
                    const snapshotId = snapshotIds.get(kernelId);
                    if (snapshotId) {
                        await managedKernel.instance.resume(snapshotId);
                    }
                }

                managedKernel.status = 'running';
                managedKernel.lastActivity = Date.now();
            } catch (error) {
                this.logger.error('Failed to resume kernel', error as Error, {
                    kernelId,
                });
                managedKernel.status = 'failed';
            }
        }
    }

    /**
     * Cleanup all kernels
     */
    async cleanup(): Promise<void> {
        const cleanupPromises = Array.from(this.kernels.values()).map(
            async (managedKernel) => {
                if (managedKernel.instance) {
                    try {
                        await managedKernel.instance.enhancedCleanup();
                    } catch (error) {
                        this.logger.error(
                            'Failed to cleanup kernel',
                            error as Error,
                            {
                                kernelId: managedKernel.spec.kernelId,
                            },
                        );
                    }
                }
            },
        );

        await Promise.all(cleanupPromises);

        this.kernels.clear();
        this.eventBridges.clear();
        this.crossKernelEventLog.length = 0;

        this.logger.info('MultiKernelManager cleaned up');
    }
}

/**
 * Create multi-kernel manager with pre-configured specs
 */
export function createMultiKernelManager(
    config: MultiKernelConfig,
): MultiKernelManager {
    return new MultiKernelManager(config);
}

/**
 * Helper to create observability kernel spec (no persistence/snapshots)
 */
export function createObservabilityKernelSpec(
    kernelId: string,
    workflow: Workflow,
): KernelSpec {
    return {
        kernelId,
        namespace: 'obs',
        workflow,
        needsPersistence: false, // Logs are fire-and-forget
        needsSnapshots: false, // No need to recover logs
        quotas: undefined, // No limits for observability
        performance: {
            enableBatching: true,
            enableCaching: false,
            enableLazyLoading: true, // Lazy load for better performance
        },
    };
}

/**
 * Helper to create agent execution kernel spec (with persistence/snapshots)
 */
export function createAgentKernelSpec(
    kernelId: string,
    workflow: Workflow,
    quotas?: KernelConfig['quotas'],
): KernelSpec {
    return {
        kernelId,
        namespace: 'agent',
        workflow,
        needsPersistence: true, // Agents need state persistence
        needsSnapshots: true, // Agents need recovery from snapshots
        quotas: quotas || {
            maxEvents: 1000,
            maxDuration: 5 * 60 * 1000, // 5 minutes
            maxMemory: 512 * 1024 * 1024, // 512MB
        },
        runtimeConfig: {
            enableAcks: true,
            maxRetries: 3,
        },
        performance: {
            enableBatching: true,
            enableCaching: true,
            enableLazyLoading: false,
        },
    };
}
