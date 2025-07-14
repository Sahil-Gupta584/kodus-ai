/**
 * @module observability/functional
 * @description Abordagem funcional para observabilidade
 *
 * Usa conceitos funcionais:
 * - Funções puras
 * - Composição de funções
 * - Currying
 * - Monads para tratamento de erros
 * - Immutabilidade
 */

import { getObservability, createLogger } from './index.js';

/**
 * Tipo para operações observáveis
 */
type ObservableOperation<TInput, TOutput> = (
    input: TInput,
    context?: Record<string, unknown>,
) => Promise<TOutput>;

/**
 * Tipo para métricas
 */
type Metric = {
    name: string;
    value: number;
    type: 'counter' | 'histogram' | 'gauge';
    labels: Record<string, string>;
    timestamp: number;
};

/**
 * Tipo para logs
 */
type LogEntry = {
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    context: Record<string, unknown>;
    timestamp: number;
    correlationId?: string;
};

/**
 * Tipo para observação
 */
type Observation = {
    metrics: Metric[];
    logs: LogEntry[];
    duration: number;
    success: boolean;
    error?: Error;
};

/**
 * Função pura para criar métricas
 */
export const createMetric = (
    name: string,
    value: number,
    type: Metric['type'],
    labels: Record<string, string> = {},
): Metric => ({
    name,
    value,
    type,
    labels,
    timestamp: Date.now(),
});

/**
 * Função pura para criar logs
 */
export const createLogEntry = (
    level: LogEntry['level'],
    message: string,
    context: Record<string, unknown> = {},
    correlationId?: string,
): LogEntry => ({
    level,
    message,
    context,
    timestamp: Date.now(),
    correlationId,
});

/**
 * Função pura para criar observação
 */
export const createObservation = (
    metrics: Metric[] = [],
    logs: LogEntry[] = [],
    duration: number = 0,
    success: boolean = true,
    error?: Error,
): Observation => ({
    metrics,
    logs,
    duration,
    success,
    error,
});

/**
 * Função pura para medir duração
 */
export const measureDuration = (startTime: number): number =>
    Date.now() - startTime;

/**
 * Função pura para extrair contexto
 */
export const extractContext = <TInput>(
    input: TInput,
    extractors: Array<(input: TInput) => Record<string, unknown>>,
): Record<string, unknown> =>
    extractors.reduce(
        (context, extractor) => ({
            ...context,
            ...extractor(input),
        }),
        {},
    );

/**
 * Currying para criar observador
 */
export const createObserver = <TInput>(operationName: string) => {
    const obs = getObservability();
    const logger = createLogger(operationName);

    return (extractContextFn?: (input: TInput) => Record<string, unknown>) => {
        return <TOutput>(
            operation: ObservableOperation<TInput, TOutput>,
        ): ObservableOperation<TInput, TOutput> => {
            return async (input: TInput, context?: Record<string, unknown>) => {
                const startTime = Date.now();
                const extractedContext = extractContextFn?.(input) || {};
                const fullContext = { ...extractedContext, ...context };

                // Log de início
                const startLog = createLogEntry(
                    'info',
                    `${operationName} started`,
                    fullContext,
                    obs.getContext()?.correlationId,
                );

                logger.info(startLog.message, startLog.context);

                // Métrica de início
                const startMetric = createMetric(
                    `${operationName}.started`,
                    1,
                    'counter',
                    Object.fromEntries(
                        Object.entries(fullContext).map(([k, v]) => [
                            k,
                            String(v),
                        ]),
                    ),
                );

                obs.telemetry.recordMetric(
                    startMetric.type,
                    startMetric.name,
                    startMetric.value,
                    Object.fromEntries(
                        Object.entries(fullContext).map(([k, v]) => [
                            k,
                            String(v),
                        ]),
                    ),
                );

                try {
                    // Executar operação
                    const result = await operation(input, fullContext);
                    const duration = measureDuration(startTime);

                    // Log de sucesso
                    const successLog = createLogEntry(
                        'info',
                        `${operationName} completed`,
                        { ...fullContext, durationMs: duration, success: true },
                        obs.getContext()?.correlationId,
                    );

                    logger.info(successLog.message, successLog.context);

                    // Métricas de sucesso
                    const successMetrics = [
                        createMetric(
                            `${operationName}.duration`,
                            duration,
                            'histogram',
                            { ...fullContext, success: 'true' },
                        ),
                        createMetric(
                            `${operationName}.completed`,
                            1,
                            'counter',
                            { ...fullContext, success: 'true' },
                        ),
                    ];

                    successMetrics.forEach((metric) => {
                        obs.telemetry.recordMetric(
                            metric.type,
                            metric.name,
                            metric.value,
                            Object.fromEntries(
                                Object.entries(metric.labels).map(([k, v]) => [
                                    k,
                                    String(v),
                                ]),
                            ),
                        );
                    });

                    return result;
                } catch (error) {
                    const duration = measureDuration(startTime);

                    // Log de erro
                    const errorLog = createLogEntry(
                        'error',
                        `${operationName} failed`,
                        {
                            ...fullContext,
                            durationMs: duration,
                            errorType: (error as Error).name,
                        },
                        obs.getContext()?.correlationId,
                    );

                    logger.error(
                        errorLog.message,
                        error as Error,
                        errorLog.context,
                    );

                    // Métrica de erro
                    const errorMetric = createMetric(
                        `${operationName}.errors`,
                        1,
                        'counter',
                        { ...fullContext, errorType: (error as Error).name },
                    );

                    obs.telemetry.recordMetric(
                        errorMetric.type,
                        errorMetric.name,
                        errorMetric.value,
                        Object.fromEntries(
                            Object.entries(errorMetric.labels).map(([k, v]) => [
                                k,
                                String(v),
                            ]),
                        ),
                    );

                    throw error;
                }
            };
        };
    };
};

/**
 * Composição de observadores
 */
export const composeObservers = <TInput, TOutput>(
    ...observers: Array<
        (
            operation: ObservableOperation<TInput, TOutput>,
        ) => ObservableOperation<TInput, TOutput>
    >
) => {
    return (
        operation: ObservableOperation<TInput, TOutput>,
    ): ObservableOperation<TInput, TOutput> => {
        return observers.reduceRight(
            (next, observer) => observer(next),
            operation,
        );
    };
};

/**
 * Função pura para validar entrada
 */
export const validateInput = <TInput>(
    validators: Array<(input: TInput) => boolean | string>,
) => {
    return (input: TInput): { valid: boolean; errors: string[] } => {
        const errors: string[] = [];

        validators.forEach((validator) => {
            const result = validator(input);
            if (result !== true) {
                errors.push(
                    typeof result === 'string' ? result : 'Validation failed',
                );
            }
        });

        return { valid: errors.length === 0, errors };
    };
};

/**
 * Função pura para transformar resultado
 */
export const transformResult = <TInput, TOutput, TTransformed>(
    transformer: (result: TOutput, input: TInput) => TTransformed,
) => {
    return (
        operation: ObservableOperation<TInput, TOutput>,
    ): ObservableOperation<TInput, TTransformed> => {
        return async (input: TInput, context?: Record<string, unknown>) => {
            const result = await operation(input, context);
            return transformer(result, input);
        };
    };
};

/**
 * Função pura para retry
 */
export const withRetry = <TInput, TOutput>(
    maxRetries: number,
    backoffMs: number = 1000,
) => {
    return (
        operation: ObservableOperation<TInput, TOutput>,
    ): ObservableOperation<TInput, TOutput> => {
        return async (input: TInput, context?: Record<string, unknown>) => {
            let lastError: Error;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    return await operation(input, context);
                } catch (error) {
                    lastError = error as Error;

                    if (attempt < maxRetries) {
                        await new Promise((resolve) =>
                            setTimeout(
                                resolve,
                                backoffMs * Math.pow(2, attempt),
                            ),
                        );
                    }
                }
            }

            throw lastError!;
        };
    };
};

/**
 * Função pura para timeout
 */
export const withTimeout = <TInput, TOutput>(timeoutMs: number) => {
    return (
        operation: ObservableOperation<TInput, TOutput>,
    ): ObservableOperation<TInput, TOutput> => {
        return async (input: TInput, context?: Record<string, unknown>) => {
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(
                    () => reject(new Error('Operation timeout')),
                    timeoutMs,
                );
            });

            return Promise.race([operation(input, context), timeoutPromise]);
        };
    };
};

/**
 * Factory para criar operações observáveis
 */
export const createObservableOperation = <TInput, TOutput>(
    operation: ObservableOperation<TInput, TOutput>,
    operationName: string,
    extractContextFn?: (input: TInput) => Record<string, unknown>,
    options?: {
        retries?: number;
        timeout?: number;
        validators?: Array<(input: TInput) => boolean | string>;
        transformer?: (result: TOutput, input: TInput) => TOutput;
    },
): ObservableOperation<TInput, TOutput> => {
    let observableOperation = operation;

    // Aplicar validadores
    if (options?.validators) {
        const validator = validateInput(options.validators);
        observableOperation = async (
            input: TInput,
            context?: Record<string, unknown>,
        ) => {
            const validation = validator(input);
            if (!validation.valid) {
                throw new Error(
                    `Validation failed: ${validation.errors.join(', ')}`,
                );
            }
            return await operation(input, context);
        };
    }

    // Aplicar observador
    const observer = createObserver<TInput>(operationName)(extractContextFn);
    observableOperation = observer(observableOperation);

    // Aplicar retry
    if (options?.retries) {
        observableOperation = withRetry<TInput, TOutput>(options.retries)(
            observableOperation,
        );
    }

    // Aplicar timeout
    if (options?.timeout) {
        observableOperation = withTimeout<TInput, TOutput>(options.timeout)(
            observableOperation,
        );
    }

    // Aplicar transformer
    if (options?.transformer) {
        observableOperation = transformResult<TInput, TOutput, TOutput>(
            options.transformer,
        )(observableOperation);
    }

    return observableOperation;
};
