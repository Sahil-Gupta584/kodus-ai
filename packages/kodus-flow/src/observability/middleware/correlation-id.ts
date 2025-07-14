/**
 * @module observability/middleware/correlation-id
 * @description Middleware para correlation ID automático
 *
 * Responsabilidades:
 * - Gerar correlation ID automaticamente
 * - Propagar correlation ID entre camadas
 * - Integrar com observabilidade
 */

import type { EventHandler, AnyEvent } from '../../core/types/common-types.js';
import { IdGenerator } from '../../utils/id-generator.js';
import { getObservability } from '../index.js';

/**
 * Configuração do middleware de correlation ID
 */
export interface CorrelationIdConfig {
    /**
     * Se deve gerar correlation ID automaticamente
     * @default true
     */
    autoGenerate?: boolean;

    /**
     * Nome do campo para correlation ID no evento
     * @default 'correlationId'
     */
    fieldName?: string;

    /**
     * Se deve propagar correlation ID para observabilidade
     * @default true
     */
    propagateToObservability?: boolean;

    /**
     * Se deve adicionar correlation ID ao contexto do logger
     * @default true
     */
    addToLoggerContext?: boolean;
}

/**
 * Middleware para correlation ID automático
 */
export function withCorrelationId(config: CorrelationIdConfig = {}) {
    const {
        autoGenerate = true,
        fieldName = 'correlationId',
        propagateToObservability = true,
        addToLoggerContext = true,
    } = config;

    return function <T extends AnyEvent>(
        handler: EventHandler<T>,
    ): EventHandler<T> {
        return async function correlatedHandler(
            event: T,
        ): Promise<void | AnyEvent> {
            // Extrair correlation ID do evento ou gerar automaticamente
            let correlationId = (event.data as Record<string, unknown>)?.[
                fieldName
            ] as string | undefined;

            if (!correlationId && autoGenerate) {
                correlationId = IdGenerator.correlationId();

                // Adicionar ao evento se possível
                if (event.data && typeof event.data === 'object') {
                    (event.data as Record<string, unknown>)[fieldName] =
                        correlationId;
                }
            }

            // Integrar com observabilidade se habilitado
            if (propagateToObservability && correlationId) {
                const obs = getObservability();

                // Criar contexto de observabilidade
                const context = obs.createContext(correlationId);
                obs.setContext(context);

                try {
                    // Executar handler com contexto
                    const result = await handler(event);

                    // Log de sucesso se addToLoggerContext estiver habilitado
                    if (addToLoggerContext) {
                        obs.logger.debug('Event processed successfully', {
                            eventType: event.type,
                            correlationId,
                            success: true,
                        });
                    }

                    return result;
                } catch (error) {
                    // Log de erro com correlation ID
                    if (addToLoggerContext) {
                        obs.logger.error(
                            'Event processing failed',
                            error as Error,
                            {
                                eventType: event.type,
                                correlationId,
                                success: false,
                            },
                        );
                    }

                    throw error;
                } finally {
                    // Limpar contexto
                    obs.clearContext();
                }
            } else {
                // Executar sem integração com observabilidade
                return await handler(event);
            }
        };
    };
}

/**
 * Decorator para métodos com correlation ID automático
 */
export function withAutoCorrelationId(_config: CorrelationIdConfig = {}) {
    return function (
        _target: unknown,
        propertyKey: string,
        descriptor: PropertyDescriptor,
    ) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: unknown[]) {
            const correlationId = IdGenerator.correlationId();
            const obs = getObservability();

            // Criar contexto
            const context = obs.createContext(correlationId);
            obs.setContext(context);

            try {
                // Adicionar correlation ID ao primeiro argumento se for um evento
                if (
                    args[0] &&
                    typeof args[0] === 'object' &&
                    'type' in args[0]
                ) {
                    const event = args[0] as AnyEvent;
                    if (event.data && typeof event.data === 'object') {
                        (event.data as Record<string, unknown>).correlationId =
                            correlationId;
                    }
                }

                const result = await originalMethod.apply(this, args);

                // Log de sucesso
                obs.logger.debug(
                    `Method ${propertyKey} completed successfully`,
                    {
                        correlationId,
                        method: propertyKey,
                        success: true,
                    },
                );

                return result;
            } catch (error) {
                // Log de erro
                obs.logger.error(
                    `Method ${propertyKey} failed`,
                    error as Error,
                    {
                        correlationId,
                        method: propertyKey,
                        success: false,
                    },
                );

                throw error;
            } finally {
                obs.clearContext();
            }
        };

        return descriptor;
    };
}

/**
 * Função utilitária para extrair correlation ID de qualquer objeto
 */
export function extractCorrelationId(obj: unknown): string | undefined {
    if (!obj || typeof obj !== 'object') {
        return undefined;
    }

    const record = obj as Record<string, unknown>;

    // Tentar diferentes nomes de campo
    const possibleFields = [
        'correlationId',
        'correlation_id',
        'correlation-id',
        'requestId',
        'request_id',
    ];

    for (const field of possibleFields) {
        if (record[field] && typeof record[field] === 'string') {
            return record[field] as string;
        }
    }

    return undefined;
}

/**
 * Função utilitária para propagar correlation ID entre objetos
 */
export function propagateCorrelationId(
    source: unknown,
    target: Record<string, unknown>,
    fieldName: string = 'correlationId',
): void {
    const correlationId = extractCorrelationId(source);
    if (correlationId) {
        target[fieldName] = correlationId;
    }
}

/**
 * Middleware para eventos com correlation ID obrigatório
 */
export function requireCorrelationId(config: CorrelationIdConfig = {}) {
    return function <T extends AnyEvent>(
        handler: EventHandler<T>,
    ): EventHandler<T> {
        return async function requiredCorrelationHandler(
            event: T,
        ): Promise<void | AnyEvent> {
            const correlationId = extractCorrelationId(event.data);

            if (!correlationId) {
                throw new Error(
                    `Correlation ID is required for event type: ${event.type}`,
                );
            }

            // Usar o middleware normal com correlation ID existente
            return withCorrelationId({
                ...config,
                autoGenerate: false, // Não gerar, usar o existente
            })(handler)(event);
        };
    };
}
