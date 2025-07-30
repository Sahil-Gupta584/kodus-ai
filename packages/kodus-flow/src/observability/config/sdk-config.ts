/**
 * @module observability/config/sdk-config
 * @description Configuração padrão para SDK distribuído via npm
 */

import type { ObservabilityConfig } from '../index.js';
import { ConsoleDebugOutput } from '../debugging.js';

/**
 * Configuração padrão para SDK em produção
 */
export const SDK_PRODUCTION_CONFIG: ObservabilityConfig = {
    enabled: true,
    environment: 'production',
    debug: false,

    logging: {
        enabled: true,
        level: 'info',
        outputs: ['console'],
        // Em produção, logs são estruturados para análise
    },

    telemetry: {
        enabled: false, // Desabilitado por padrão para não impactar performance
        serviceName: 'kodus-flow-sdk',
        sampling: {
            rate: 0.1, // 10% sampling
            strategy: 'probabilistic',
        },
        features: {
            traceEvents: false,
            traceKernel: false,
            traceSnapshots: false,
            tracePersistence: false,
            metricsEnabled: true,
        },
    },

    monitoring: {
        enabled: true,
        collectionIntervalMs: 30000, // 30 segundos
        retentionPeriodMs: 24 * 60 * 60 * 1000, // 24 horas
        enableRealTime: false,
        enableHistorical: true,
        maxMetricsHistory: 100,
        exportFormats: ['json'],
    },

    debugging: {
        enabled: false, // Desabilitado em produção
        level: 'warn',
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

    correlation: {
        enabled: true,
        generateIds: true,
        propagateContext: true,
    },
};

/**
 * Configuração padrão para SDK em desenvolvimento
 */
export const SDK_DEVELOPMENT_CONFIG: ObservabilityConfig = {
    enabled: true,
    environment: 'development',
    debug: true,

    logging: {
        enabled: true,
        level: 'debug',
        outputs: ['console'],
        // Logs legíveis para humanos
    },

    telemetry: {
        enabled: true,
        serviceName: 'kodus-flow-sdk-dev',
        sampling: {
            rate: 1.0, // 100% sampling em dev
            strategy: 'probabilistic',
        },
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
        collectionIntervalMs: 10000, // 10 segundos
        retentionPeriodMs: 60 * 60 * 1000, // 1 hora
        enableRealTime: true,
        enableHistorical: true,
        maxMetricsHistory: 50,
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
        outputs: [new ConsoleDebugOutput()],
        maxEventHistory: 1000,
        maxMeasurementHistory: 500,
        autoFlush: true,
        flushInterval: 60000, // 1 minuto
    },

    correlation: {
        enabled: true,
        generateIds: true,
        propagateContext: true,
    },
};

/**
 * Configuração padrão para SDK em testes
 */
export const SDK_TEST_CONFIG: ObservabilityConfig = {
    enabled: true,
    environment: 'test',
    debug: false,

    logging: {
        enabled: true,
        level: 'warn', // Apenas warnings e erros
        outputs: ['console'],
    },

    telemetry: {
        enabled: false,
        serviceName: 'kodus-flow-sdk-test',
        sampling: {
            rate: 0.0, // Sem sampling em testes
            strategy: 'probabilistic',
        },
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
        collectionIntervalMs: 0,
        retentionPeriodMs: 0,
        enableRealTime: false,
        enableHistorical: false,
        maxMetricsHistory: 0,
        exportFormats: [],
    },

    debugging: {
        enabled: false,
        level: 'warn',
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

    correlation: {
        enabled: true,
        generateIds: true,
        propagateContext: false, // Não propaga em testes
    },
};

/**
 * Detectar configuração baseada no ambiente
 */
export function getSDKConfig(): ObservabilityConfig {
    const env = process.env.NODE_ENV || 'development';

    switch (env) {
        case 'production':
            return SDK_PRODUCTION_CONFIG;
        case 'test':
            return SDK_TEST_CONFIG;
        case 'development':
        default:
            return SDK_DEVELOPMENT_CONFIG;
    }
}

/**
 * Configuração customizada para usuários
 */
export function createSDKConfig(
    overrides: Partial<ObservabilityConfig> = {},
): ObservabilityConfig {
    const baseConfig = getSDKConfig();
    return { ...baseConfig, ...overrides };
}
