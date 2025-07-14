/**
 * @module runtime/core/index
 * @description Runtime Core Components - Production Grade Event Processing
 *
 * This module exports all the core runtime components including the enhanced
 * event processing capabilities with durability, retry logic, and DLQ support.
 *
 * Components:
 * - EventQueue: Basic event queue with priority and backpressure
 * - DurableEventQueue: Event queue with persistence capabilities
 * - DeadLetterQueue: Handler for failed events with retry exhaustion
 * - EnhancedEventQueue: Production-ready queue with all features
 * - OptimizedEventProcessor: High-performance event processing
 * - StreamManager: Stream operations and monitoring
 * - MemoryMonitor: Memory usage tracking and alerts
 */

// Base event queue
export { EventQueue } from './event-queue.js';
export type { EventQueueConfig, QueueItem } from './event-queue.js';

// Dead Letter Queue handler (for future use)
export { DeadLetterQueue } from './dlq-handler.js';
export type { DLQConfig, DLQItem, DLQStats } from './dlq-handler.js';

// Event processor
export { OptimizedEventProcessor } from './event-processor-optimized.js';
export type { OptimizedEventProcessorConfig } from './event-processor-optimized.js';

// Other core components
export { StreamManager } from './stream-manager.js';
export { MemoryMonitor } from './memory-monitor.js';
export type {
    MemoryMonitorConfig,
    MemoryMetrics,
    MemoryAlert,
    MemoryMonitorStats,
} from './memory-monitor.js';

// Event factory utilities
export {
    workflowEvent,
    isEventType,
    isEventTypeGroup,
    extractEventData,
} from './event-factory.js';

/**
 * Default sensible configuration for EnhancedEventQueue
 * Users can override any of these settings when creating their queue
 */
export const DEFAULT_ENHANCED_CONFIG = {
    // Durability settings
    persistCriticalEvents: true,
    enableAutoRecovery: true,
    maxPersistedEvents: 1000,
    criticalEventPrefixes: ['agent.', 'workflow.', 'kernel.'],

    // Retry settings
    maxRetries: 3,
    baseRetryDelay: 1000,
    maxRetryDelay: 30000,
    enableJitter: true,
    jitterRatio: 0.1,

    // DLQ settings
    enableDLQ: true,
    dlq: {
        enablePersistence: true,
        maxDLQSize: 500,
        enableDetailedLogging: true,
        alertThreshold: 50,
        maxRetentionDays: 7,
        enableAutoCleanup: true,
    },

    // Queue settings
    maxQueueDepth: 10000,
    enableObservability: true,
    batchSize: 100,
    chunkSize: 50,
    maxConcurrent: 10,
    enableAutoScaling: false, // Disable auto-scaling to prevent memory loops
} as const;

/**
 * Runtime Core version and feature flags
 */
export const RUNTIME_CORE_VERSION = '1.1.0';
export const RUNTIME_FEATURES = {
    DURABILITY: true,
    DLQ: true,
    ENHANCED_RETRY: true,
    CIRCUIT_BREAKER: false, // Future feature
    PARTITIONING: false, // Future feature
    TRACING: false, // Future feature
} as const;
