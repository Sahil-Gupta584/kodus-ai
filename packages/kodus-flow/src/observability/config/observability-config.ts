/**
 * Observability Configuration
 *
 * Configuração para observabilidade
 */

export type Environment = 'development' | 'production' | 'test';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Configuração de observabilidade
 */
export interface ObservabilityConfig {
    // Configuração básica
    enabled: boolean;
    environment: Environment;

    // Logging simples
    logging: {
        level: LogLevel;
        enableAsync: boolean;
        maxContextSize?: number;
    };

    // Telemetry simples
    telemetry: {
        enabled: boolean;
        serviceName: string;
        samplingRate: number; // 0.0 to 1.0
    };

    // Monitoring simples
    monitoring: {
        enabled: boolean;
        collectionIntervalMs: number;
        maxHistorySize: number;
    };

    // Debugging simples
    debugging: {
        enabled: boolean;
        level: LogLevel;
        maxEventHistory: number;
    };
}

/**
 * Configurações padrão por ambiente
 */
export const DEFAULT_CONFIGS: Record<Environment, ObservabilityConfig> = {
    development: {
        enabled: true,
        environment: 'development',
        logging: {
            level: 'debug',
            enableAsync: false,
            maxContextSize: 10000,
        },
        telemetry: {
            enabled: true,
            serviceName: 'kodus-flow-dev',
            samplingRate: 1.0,
        },
        monitoring: {
            enabled: true,
            collectionIntervalMs: 5000,
            maxHistorySize: 100,
        },
        debugging: {
            enabled: true,
            level: 'debug',
            maxEventHistory: 1000,
        },
    },
    production: {
        enabled: true,
        environment: 'production',
        logging: {
            level: 'warn',
            enableAsync: true,
            maxContextSize: 5000,
        },
        telemetry: {
            enabled: true,
            serviceName: 'kodus-flow-prod',
            samplingRate: 0.1,
        },
        monitoring: {
            enabled: true,
            collectionIntervalMs: 30000,
            maxHistorySize: 50,
        },
        debugging: {
            enabled: false,
            level: 'error',
            maxEventHistory: 100,
        },
    },
    test: {
        enabled: true,
        environment: 'test',
        logging: {
            level: 'error',
            enableAsync: false,
            maxContextSize: 1000,
        },
        telemetry: {
            enabled: false,
            serviceName: 'kodus-flow-test',
            samplingRate: 0.0,
        },
        monitoring: {
            enabled: false,
            collectionIntervalMs: 60000,
            maxHistorySize: 10,
        },
        debugging: {
            enabled: false,
            level: 'error',
            maxEventHistory: 10,
        },
    },
};

/**
 * Função helper para obter configuração
 */
export function getObservabilityConfig(
    environment?: Environment,
): ObservabilityConfig {
    const env = environment || detectEnvironment();
    return DEFAULT_CONFIGS[env];
}

/**
 * Detectar ambiente automaticamente
 */
function detectEnvironment(): Environment {
    if (process.env.NODE_ENV === 'production') return 'production';
    if (process.env.NODE_ENV === 'test') return 'test';
    return 'development';
}

/**
 * Validar configuração
 */
export function validateConfig(config: ObservabilityConfig): boolean {
    if (!config.enabled) return true; // Configuração desabilitada é válida

    // Validar logging
    if (
        config.logging.level &&
        !['debug', 'info', 'warn', 'error'].includes(config.logging.level)
    ) {
        return false;
    }

    // Validar telemetry
    if (config.telemetry.enabled) {
        if (
            !config.telemetry.serviceName ||
            config.telemetry.samplingRate < 0 ||
            config.telemetry.samplingRate > 1
        ) {
            return false;
        }
    }

    // Validar monitoring
    if (config.monitoring.enabled) {
        if (
            config.monitoring.collectionIntervalMs < 1000 ||
            config.monitoring.maxHistorySize < 1
        ) {
            return false;
        }
    }

    // Validar debugging
    if (config.debugging.enabled) {
        if (
            !['debug', 'info', 'warn', 'error'].includes(
                config.debugging.level,
            ) ||
            config.debugging.maxEventHistory < 1
        ) {
            return false;
        }
    }

    return true;
}
