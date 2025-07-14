/**
 * @module observability/unified-config
 * @description Configuração unificada para todo o sistema de observabilidade
 *
 * Centraliza todas as configurações:
 * - Logger (Pino) configuration
 * - Event Bus configuration
 * - Timeline configuration
 * - Telemetry configuration
 * - Monitoring configuration
 * - Debugging configuration
 * - Environment-specific optimizations
 */

import type { LoggerConfig } from './core-logger.js';
import type { EventBusConfig } from './event-bus.js';
import type { TelemetryConfig } from './telemetry.js';
import type { MetricsConfig } from './monitoring.js';
import type { DebugConfig } from './debugging.js';

// ============================================================================
// 1️⃣ TIPOS DE CONFIGURAÇÃO UNIFICADA
// ============================================================================

/**
 * Ambientes suportados
 */
export type Environment = 'development' | 'production' | 'test';

/**
 * Configuração completa do sistema de observabilidade
 */
export interface UnifiedObservabilityConfig {
    // Global settings
    environment: Environment;
    enabled: boolean;

    // Core components
    logger: LoggerConfig;
    eventBus: EventBusConfig;
    telemetry: TelemetryConfig;
    monitoring: MetricsConfig;
    debugging: DebugConfig;

    // Timeline specific
    timeline: {
        enabled: boolean;
        maxAge: number;
        cleanupInterval: number;
        bufferSize: number;
    };

    // Performance settings
    performance: {
        enableHighPerformanceMode: boolean;
        bufferSize: number;
        flushInterval: number;
        maxConcurrentEvents: number;
    };

    // Integration settings
    integration: {
        autoCorrelation: boolean;
        autoPublishEvents: boolean;
        enableMiddleware: boolean;
    };

    // Error handling
    errorHandling: {
        errorThreshold: number;
        silentErrors: boolean;
        logErrorDetails: boolean;
    };
}

// ============================================================================
// 2️⃣ CONFIGURAÇÕES BASE POR AMBIENTE
// ============================================================================

/**
 * Configuração base para desenvolvimento
 */
const DEVELOPMENT_CONFIG: UnifiedObservabilityConfig = {
    environment: 'development',
    enabled: true,

    logger: {
        level: 'debug',
        prettyPrint: true,
        redact: [],
        formatters: {
            level: (label: string) => ({ level: label }),
            bindings: (_bindings: Record<string, unknown>) => ({
                pid: _bindings.pid,
                hostname: _bindings.hostname,
                service: 'kodus-flow',
                environment: 'development',
            }),
        },
    },

    eventBus: {
        maxListeners: 50,
        bufferSize: 100,
        flushInterval: 50,
        enableLogging: true,
        enableTimeline: true,
        enableTelemetry: true,
        enableMonitoring: true,
        enableDebugging: true,
        eventFilters: [],
        componentFilters: [],
        errorThreshold: 5,
    },

    telemetry: {
        enabled: true,
        serviceName: 'kodus-flow',
        sampling: { rate: 1.0, strategy: 'probabilistic' },
        features: {
            traceEvents: true,
            traceKernel: true,
            traceSnapshots: true,
            tracePersistence: true,
            metricsEnabled: true,
        },
    },

    monitoring: {
        enabled: true,
        collectionIntervalMs: 5000,
        retentionPeriodMs: 60 * 60 * 1000, // 1 hour
        enableRealTime: true,
        enableHistorical: true,
        maxMetricsHistory: 500,
        exportFormats: ['json'],
    },

    debugging: {
        enabled: true,
        level: 'debug',
        features: {
            eventTracing: true,
            performanceProfiling: true,
            stateInspection: true,
            errorAnalysis: true,
        },
        outputs: [],
        maxEventHistory: 1000,
        maxMeasurementHistory: 500,
        autoFlush: true,
        flushInterval: 60000,
    },

    timeline: {
        enabled: true,
        maxAge: 60 * 60 * 1000, // 1 hour
        cleanupInterval: 5 * 60 * 1000, // 5 minutes
        bufferSize: 200,
    },

    performance: {
        enableHighPerformanceMode: false,
        bufferSize: 100,
        flushInterval: 50,
        maxConcurrentEvents: 10,
    },

    integration: {
        autoCorrelation: true,
        autoPublishEvents: true,
        enableMiddleware: true,
    },

    errorHandling: {
        errorThreshold: 5,
        silentErrors: false,
        logErrorDetails: true,
    },
};

/**
 * Configuração base para produção
 */
const PRODUCTION_CONFIG: UnifiedObservabilityConfig = {
    environment: 'production',
    enabled: true,

    logger: {
        level: 'info',
        prettyPrint: false,
        redact: ['password', 'token', 'secret', 'key', 'authorization'],
        formatters: {
            level: (_label: string, number: number) => ({ level: number }),
            bindings: (_bindings: Record<string, unknown>) => ({
                service: 'kodus-flow',
                version: process.env.npm_package_version || '1.0.0',
                environment: 'production',
            }),
        },
    },

    eventBus: {
        maxListeners: 200,
        bufferSize: 1000,
        flushInterval: 100,
        enableLogging: true,
        enableTimeline: true,
        enableTelemetry: true,
        enableMonitoring: true,
        enableDebugging: false,
        eventFilters: [],
        componentFilters: [],
        errorThreshold: 20,
    },

    telemetry: {
        enabled: true,
        serviceName: 'kodus-flow',
        sampling: { rate: 0.1, strategy: 'probabilistic' }, // 10% sampling
        features: {
            traceEvents: true,
            traceKernel: true,
            traceSnapshots: false,
            tracePersistence: false,
            metricsEnabled: true,
        },
    },

    monitoring: {
        enabled: true,
        collectionIntervalMs: 30000,
        retentionPeriodMs: 24 * 60 * 60 * 1000, // 24 hours
        enableRealTime: true,
        enableHistorical: true,
        maxMetricsHistory: 2000,
        exportFormats: ['json', 'prometheus'],
    },

    debugging: {
        enabled: false,
        level: 'error',
        features: {
            eventTracing: false,
            performanceProfiling: false,
            stateInspection: false,
            errorAnalysis: true,
        },
        outputs: [],
        maxEventHistory: 1000,
        maxMeasurementHistory: 500,
        autoFlush: true,
        flushInterval: 60000,
    },

    timeline: {
        enabled: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        cleanupInterval: 60 * 60 * 1000, // 1 hour
        bufferSize: 1000,
    },

    performance: {
        enableHighPerformanceMode: true,
        bufferSize: 1000,
        flushInterval: 100,
        maxConcurrentEvents: 50,
    },

    integration: {
        autoCorrelation: true,
        autoPublishEvents: true,
        enableMiddleware: true,
    },

    errorHandling: {
        errorThreshold: 20,
        silentErrors: true,
        logErrorDetails: false,
    },
};

/**
 * Configuração base para testes
 */
const TEST_CONFIG: UnifiedObservabilityConfig = {
    environment: 'test',
    enabled: false,

    logger: {
        level: 'silent',
        prettyPrint: false,
        redact: [],
    },

    eventBus: {
        maxListeners: 10,
        bufferSize: 10,
        flushInterval: 10,
        enableLogging: false,
        enableTimeline: false,
        enableTelemetry: false,
        enableMonitoring: false,
        enableDebugging: false,
        eventFilters: [],
        componentFilters: [],
        errorThreshold: 1,
    },

    telemetry: {
        enabled: false,
        serviceName: 'kodus-flow-test',
        sampling: { rate: 0.0, strategy: 'probabilistic' },
        features: {
            traceEvents: false,
            traceKernel: false,
            traceSnapshots: false,
            tracePersistence: false,
            metricsEnabled: false,
        },
    },

    monitoring: {
        enabled: false,
        collectionIntervalMs: 1000,
        retentionPeriodMs: 60 * 1000, // 1 minute
        enableRealTime: false,
        enableHistorical: false,
        maxMetricsHistory: 10,
        exportFormats: [],
    },

    debugging: {
        enabled: false,
        level: 'error',
        features: {
            eventTracing: false,
            performanceProfiling: false,
            stateInspection: false,
            errorAnalysis: false,
        },
        outputs: [],
        maxEventHistory: 10,
        maxMeasurementHistory: 5,
        autoFlush: false,
        flushInterval: 0,
    },

    timeline: {
        enabled: false,
        maxAge: 60 * 1000, // 1 minute
        cleanupInterval: 10 * 1000, // 10 seconds
        bufferSize: 10,
    },

    performance: {
        enableHighPerformanceMode: false,
        bufferSize: 10,
        flushInterval: 10,
        maxConcurrentEvents: 1,
    },

    integration: {
        autoCorrelation: false,
        autoPublishEvents: false,
        enableMiddleware: false,
    },

    errorHandling: {
        errorThreshold: 1,
        silentErrors: true,
        logErrorDetails: false,
    },
};

// ============================================================================
// 3️⃣ CONFIGURAÇÕES ESPECIALIZADAS
// ============================================================================

/**
 * Configuração high-performance para produção
 */
const HIGH_PERFORMANCE_CONFIG: Partial<UnifiedObservabilityConfig> = {
    logger: {
        level: 'warn',
        prettyPrint: false,
    },

    eventBus: {
        maxListeners: 500,
        bufferSize: 5000,
        flushInterval: 500,
        enableLogging: true,
        enableTimeline: true,
        enableTelemetry: true,
        enableMonitoring: true,
        enableDebugging: false,
        eventFilters: [],
        componentFilters: [],
        errorThreshold: 50,
    },

    timeline: {
        enabled: true,
        bufferSize: 5000,
        maxAge: 60 * 60 * 1000, // 1 hour apenas
        cleanupInterval: 30 * 60 * 1000, // 30 minutes
    },

    telemetry: {
        enabled: true,
        serviceName: 'kodus-flow',
        sampling: { rate: 0.01, strategy: 'probabilistic' }, // 1% sampling
        features: {
            traceEvents: true,
            traceKernel: true,
            traceSnapshots: false,
            tracePersistence: false,
            metricsEnabled: true,
        },
    },
};

/**
 * Configuração minimal para embarcado
 */
const MINIMAL_CONFIG: Partial<UnifiedObservabilityConfig> = {
    logger: {
        level: 'error',
        prettyPrint: false,
    },

    eventBus: {
        maxListeners: 20,
        bufferSize: 50,
        flushInterval: 1000,
        enableLogging: true,
        enableTimeline: false,
        enableTelemetry: false,
        enableMonitoring: false,
        enableDebugging: false,
        eventFilters: [],
        componentFilters: [],
        errorThreshold: 5,
    },

    telemetry: {
        enabled: false,
        serviceName: 'kodus-flow-minimal',
        sampling: { rate: 0.0, strategy: 'probabilistic' },
        features: {
            traceEvents: false,
            traceKernel: false,
            traceSnapshots: false,
            tracePersistence: false,
            metricsEnabled: false,
        },
    },

    monitoring: {
        enabled: false,
        collectionIntervalMs: 60000,
        retentionPeriodMs: 60 * 1000,
        enableRealTime: false,
        enableHistorical: false,
        maxMetricsHistory: 10,
        exportFormats: [],
    },

    debugging: {
        enabled: false,
        level: 'error',
        features: {
            eventTracing: false,
            performanceProfiling: false,
            stateInspection: false,
            errorAnalysis: false,
        },
        outputs: [],
        maxEventHistory: 0,
        maxMeasurementHistory: 0,
        autoFlush: false,
        flushInterval: 0,
    },

    timeline: {
        enabled: false,
        maxAge: 60 * 1000,
        cleanupInterval: 10 * 1000,
        bufferSize: 10,
    },
};

// ============================================================================
// 4️⃣ FACTORY E UTILITIES
// ============================================================================

/**
 * Configurações disponíveis
 */
const AVAILABLE_CONFIGS: Record<string, UnifiedObservabilityConfig> = {
    development: DEVELOPMENT_CONFIG,
    production: PRODUCTION_CONFIG,
    test: TEST_CONFIG,
};

/**
 * Obtém configuração base por ambiente
 */
export function getEnvironmentConfig(
    environment: Environment,
): UnifiedObservabilityConfig {
    return AVAILABLE_CONFIGS[environment] || DEVELOPMENT_CONFIG;
}

/**
 * Cria configuração customizada
 */
export function createObservabilityConfig(
    environment: Environment,
    overrides: Partial<UnifiedObservabilityConfig> = {},
): UnifiedObservabilityConfig {
    const baseConfig = getEnvironmentConfig(environment);

    return {
        ...baseConfig,
        ...overrides,

        // Merge nested objects
        logger: { ...baseConfig.logger, ...overrides.logger },
        eventBus: { ...baseConfig.eventBus, ...overrides.eventBus },
        telemetry: { ...baseConfig.telemetry, ...overrides.telemetry },
        monitoring: { ...baseConfig.monitoring, ...overrides.monitoring },
        debugging: { ...baseConfig.debugging, ...overrides.debugging },
        timeline: { ...baseConfig.timeline, ...overrides.timeline },
        performance: { ...baseConfig.performance, ...overrides.performance },
        integration: { ...baseConfig.integration, ...overrides.integration },
        errorHandling: {
            ...baseConfig.errorHandling,
            ...overrides.errorHandling,
        },
    };
}

/**
 * Aplica configuração high-performance
 */
export function applyHighPerformanceConfig(
    config: UnifiedObservabilityConfig,
): UnifiedObservabilityConfig {
    return createObservabilityConfig(config.environment, {
        ...config,
        ...HIGH_PERFORMANCE_CONFIG,
    });
}

/**
 * Aplica configuração minimal
 */
export function applyMinimalConfig(
    config: UnifiedObservabilityConfig,
): UnifiedObservabilityConfig {
    return createObservabilityConfig(config.environment, {
        ...config,
        ...MINIMAL_CONFIG,
    });
}

/**
 * Auto-detecta ambiente
 */
export function detectEnvironment(): Environment {
    const nodeEnv = process.env.NODE_ENV?.toLowerCase();

    if (nodeEnv === 'production') return 'production';
    if (nodeEnv === 'test') return 'test';
    return 'development';
}

/**
 * Cria configuração automática baseada no ambiente
 */
export function createAutoConfig(
    overrides: Partial<UnifiedObservabilityConfig> = {},
): UnifiedObservabilityConfig {
    const environment = detectEnvironment();

    // Aplicar otimizações baseadas em environment variables
    let config = getEnvironmentConfig(environment);

    // High performance mode
    if (process.env.KODUS_HIGH_PERFORMANCE === 'true') {
        config = applyHighPerformanceConfig(config);
    }

    // Minimal mode
    if (process.env.KODUS_MINIMAL === 'true') {
        config = applyMinimalConfig(config);
    }

    return createObservabilityConfig(environment, { ...config, ...overrides });
}

// ============================================================================
// 5️⃣ VALIDATION E HELPERS
// ============================================================================

/**
 * Valida configuração
 */
export function validateConfig(config: UnifiedObservabilityConfig): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    // Validar logger
    if (!config.logger.level) {
        errors.push('Logger level is required');
    }

    // Validar event bus
    if (config.eventBus.bufferSize <= 0) {
        errors.push('Event bus buffer size must be positive');
    }

    if (config.eventBus.flushInterval <= 0) {
        errors.push('Event bus flush interval must be positive');
    }

    // Validar timeline
    if (config.timeline.enabled && config.timeline.maxAge <= 0) {
        errors.push('Timeline max age must be positive when enabled');
    }

    // Validar performance
    if (config.performance.bufferSize <= 0) {
        errors.push('Performance buffer size must be positive');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Otimiza configuração para performance
 */
export function optimizeConfigForPerformance(
    config: UnifiedObservabilityConfig,
): UnifiedObservabilityConfig {
    return {
        ...config,
        logger: {
            ...config.logger,
            level:
                config.logger.level === 'debug' ? 'info' : config.logger.level,
            prettyPrint: false,
        },
        eventBus: {
            ...config.eventBus,
            bufferSize: Math.max(config.eventBus.bufferSize, 1000),
            flushInterval: Math.max(config.eventBus.flushInterval, 100),
        },
        performance: {
            ...config.performance,
            enableHighPerformanceMode: true,
            bufferSize: Math.max(config.performance.bufferSize, 1000),
        },
    };
}

/**
 * Configura para debug
 */
export function configureForDebug(
    config: UnifiedObservabilityConfig,
): UnifiedObservabilityConfig {
    return {
        ...config,
        logger: {
            ...config.logger,
            level: 'debug',
            prettyPrint: true,
        },
        eventBus: {
            ...config.eventBus,
            enableLogging: true,
            enableTimeline: true,
            enableDebugging: true,
        },
        debugging: {
            ...config.debugging,
            enabled: true,
            level: 'debug',
            features: {
                eventTracing: true,
                performanceProfiling: true,
                stateInspection: true,
                errorAnalysis: true,
            },
        },
        timeline: {
            ...config.timeline,
            enabled: true,
        },
    };
}

// ============================================================================
// 6️⃣ EXPORTS PRINCIPAIS
// ============================================================================

/**
 * Configuração padrão (auto-detectada)
 */
export const DEFAULT_CONFIG = createAutoConfig();

/**
 * Configurações pré-definidas
 */
export const CONFIGS = {
    development: DEVELOPMENT_CONFIG,
    production: PRODUCTION_CONFIG,
    test: TEST_CONFIG,
    highPerformance: applyHighPerformanceConfig(PRODUCTION_CONFIG),
    minimal: applyMinimalConfig(PRODUCTION_CONFIG),
    debug: configureForDebug(DEVELOPMENT_CONFIG),
};

// Export types and functions (avoiding conflicts)
