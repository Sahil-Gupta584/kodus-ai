/**
 * @module runtime/constants
 * @description Runtime constants and default configurations
 */

// ===== DEFAULT CONFIGURATIONS =====

/**
 * Default timeout configuration
 */
export const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    enableJitter: true,
    jitterRatio: 0.1,
};

/**
 * Default concurrency options
 */
export const DEFAULT_CONCURRENCY_OPTIONS = {
    /**
     * Maximum number of concurrent executions
     */
    maxConcurrent: 5,

    /**
     * Default concurrency mode
     */
    mode: 'drop' as 'drop' | 'wait',
};

// ===== HIGH PERFORMANCE CONFIGURATIONS =====

/**
 * High performance configuration for many executions
 * Optimized for enterprise workloads with thousands of concurrent operations
 */
export const HIGH_PERFORMANCE_CONFIG = {
    // === CONCURRENCY ===
    maxConcurrent: 100, // 100 execuções simultâneas (10x mais)
    maxConcurrentPerTenant: 50, // 50 por tenant
    maxConcurrentPerEventType: 25, // 25 por tipo de evento

    // === QUEUE SETTINGS ===
    queueSize: 10000, // 10k eventos na fila (10x mais)
    batchSize: 500, // 500 eventos por batch (5x mais)
    chunkSize: 100, // 100 por chunk

    // === MEMORY OPTIMIZATION ===
    maxMemoryUsage: 0.85, // 85% da memória (mais agressivo)
    maxCpuUsage: 0.8, // 80% da CPU (mais agressivo)
    enableCompression: true, // Compressão habilitada
    enableDeltaCompression: true, // Compressão delta

    // === AUTO-SCALING ===
    enableAutoScaling: true, // Auto-scaling habilitado
    autoScalingInterval: 15000, // Ajuste a cada 15s
    learningRate: 0.15, // Taxa de aprendizado mais agressiva

    // === RETRY OPTIMIZATION ===
    maxRetries: 2, // Menos retries para velocidade
    baseRetryDelay: 500, // Retry mais rápido
    maxRetryDelay: 10000, // Max retry menor

    // === PERSISTENCE ===
    enablePersistence: true, // Persistência habilitada
    persistCriticalEvents: true, // Eventos críticos sempre persistidos
    maxPersistedEvents: 5000, // 5k eventos persistidos

    // === CLEANUP ===
    cleanupInterval: 60000, // Cleanup a cada 1min
    staleThreshold: 300000, // 5min para stale handlers

    // === EVENT PROCESSING ===
    maxEventDepth: 200, // Profundidade maior
    maxEventChainLength: 2000, // Cadeia maior
    operationTimeoutMs: 15000, // Timeout menor para velocidade
};

/**
 * Ultra high performance configuration for extreme workloads
 * For systems with 10k+ concurrent operations
 */
export const ULTRA_HIGH_PERFORMANCE_CONFIG = {
    // === CONCURRENCY ===
    maxConcurrent: 500, // 500 execuções simultâneas
    maxConcurrentPerTenant: 100, // 100 por tenant
    maxConcurrentPerEventType: 50, // 50 por tipo de evento

    // === QUEUE SETTINGS ===
    queueSize: 50000, // 50k eventos na fila
    batchSize: 1000, // 1k eventos por batch
    chunkSize: 200, // 200 por chunk

    // === MEMORY OPTIMIZATION ===
    maxMemoryUsage: 0.9, // 90% da memória
    maxCpuUsage: 0.85, // 85% da CPU
    enableCompression: true,
    enableDeltaCompression: true,

    // === AUTO-SCALING ===
    enableAutoScaling: true,
    autoScalingInterval: 10000, // Ajuste a cada 10s
    learningRate: 0.2, // Taxa muito agressiva

    // === RETRY OPTIMIZATION ===
    maxRetries: 1, // Apenas 1 retry
    baseRetryDelay: 200, // Retry muito rápido
    maxRetryDelay: 5000, // Max retry pequeno

    // === PERSISTENCE ===
    enablePersistence: true,
    persistCriticalEvents: true,
    maxPersistedEvents: 10000, // 10k eventos persistidos

    // === CLEANUP ===
    cleanupInterval: 30000, // Cleanup a cada 30s
    staleThreshold: 180000, // 3min para stale handlers

    // === EVENT PROCESSING ===
    maxEventDepth: 500, // Profundidade muito maior
    maxEventChainLength: 5000, // Cadeia muito maior
    operationTimeoutMs: 10000, // Timeout muito menor
};

/**
 * Enterprise configuration for production workloads
 * Balanced between performance and stability
 */
export const ENTERPRISE_CONFIG = {
    // === CONCURRENCY ===
    maxConcurrent: 200, // 200 execuções simultâneas
    maxConcurrentPerTenant: 75, // 75 por tenant
    maxConcurrentPerEventType: 35, // 35 por tipo de evento

    // === QUEUE SETTINGS ===
    queueSize: 25000, // 25k eventos na fila
    batchSize: 750, // 750 eventos por batch
    chunkSize: 150, // 150 por chunk

    // === MEMORY OPTIMIZATION ===
    maxMemoryUsage: 0.8, // 80% da memória (conservador)
    maxCpuUsage: 0.75, // 75% da CPU (conservador)
    enableCompression: true,
    enableDeltaCompression: true,

    // === AUTO-SCALING ===
    enableAutoScaling: true,
    autoScalingInterval: 20000, // Ajuste a cada 20s
    learningRate: 0.1, // Taxa conservadora

    // === RETRY OPTIMIZATION ===
    maxRetries: 3, // 3 retries (padrão)
    baseRetryDelay: 1000, // Retry padrão
    maxRetryDelay: 20000, // Max retry padrão

    // === PERSISTENCE ===
    enablePersistence: true,
    persistCriticalEvents: true,
    maxPersistedEvents: 7500, // 7.5k eventos persistidos

    // === CLEANUP ===
    cleanupInterval: 90000, // Cleanup a cada 1.5min
    staleThreshold: 300000, // 5min para stale handlers

    // === EVENT PROCESSING ===
    maxEventDepth: 300, // Profundidade média
    maxEventChainLength: 3000, // Cadeia média
    operationTimeoutMs: 20000, // Timeout padrão
};

// ===== CONFIGURATION PRESETS =====

/**
 * Configuration presets for different use cases
 */
export const RUNTIME_PRESETS = {
    /**
     * Development configuration
     */
    development: {
        maxConcurrent: 10,
        queueSize: 1000,
        batchSize: 100,
        enableAutoScaling: false,
        enablePersistence: false,
    },

    /**
     * Testing configuration
     */
    testing: {
        maxConcurrent: 5,
        queueSize: 500,
        batchSize: 50,
        enableAutoScaling: false,
        enablePersistence: false,
        operationTimeoutMs: 5000,
    },

    /**
     * Production configuration
     */
    production: ENTERPRISE_CONFIG,

    /**
     * High performance configuration
     */
    highPerformance: HIGH_PERFORMANCE_CONFIG,

    /**
     * Ultra high performance configuration
     */
    ultraHighPerformance: ULTRA_HIGH_PERFORMANCE_CONFIG,
} as const;

// ===== MIDDLEWARE PRESETS =====

/**
 * Middleware presets for different performance needs
 */
export const MIDDLEWARE_PRESETS = {
    /**
     * Standard middleware for production
     */
    standard: ['timeout', 'retry', 'concurrency', 'validation'],

    /**
     * High performance middleware
     */
    highPerformance: ['timeout', 'concurrency', 'retry'],

    /**
     * Ultra high performance middleware (minimal)
     */
    ultraHighPerformance: ['timeout', 'concurrency'],
} as const;
