/**
 * @module runtime/middleware/observability
 * @description Middleware de observabilidade: cria spans por evento e propaga contexto
 */

import type { Event } from '../../core/types/events.js';
import type { EventHandler } from '../../core/types/common-types.js';
import type { Middleware, MiddlewareFactoryType } from './types.js';
import {
    getObservability,
    applyErrorToSpan,
    markSpanOk,
} from '../../observability/index.js';

export interface ObservabilityOptions {
    namePrefix?: string;
    includeSensitiveData?: boolean;
    // Filtro opcional por tipo de evento
    includeEventTypes?: string[];
    excludeEventTypes?: string[];
}

/**
 * Middleware que cria um span por processamento de evento e registra erros
 */
export const withObservability: MiddlewareFactoryType<
    ObservabilityOptions | undefined,
    Event
> = (options: ObservabilityOptions | undefined) => {
    const namePrefix = options?.namePrefix ?? 'event.process';
    const include = options?.includeEventTypes?.length
        ? new Set(options.includeEventTypes)
        : undefined;
    const exclude = options?.excludeEventTypes?.length
        ? new Set(options.excludeEventTypes)
        : undefined;

    const middleware = (<T extends Event>(
        handler: EventHandler<T>,
    ): EventHandler<T> => {
        return async (event: T) => {
            const obs = getObservability();

            // Respeita filtros de tipo de evento
            if (include && !include.has(String(event.type))) {
                return handler(event);
            }
            if (exclude && exclude.has(String(event.type))) {
                return handler(event);
            }

            const attributes: Record<string, string | number> = {};
            attributes['runtime.event.type'] = String(event.type);
            attributes['tenant.id'] =
                (event.metadata?.tenantId as string) || 'unknown';
            attributes['correlation.id'] =
                (event.metadata?.correlationId as string) || 'unknown';
            attributes['thread.id'] = event.threadId;
            attributes['event.ts'] = event.ts;

            const span = obs.telemetry.startSpan(
                `${namePrefix}.${event.type}`,
                {
                    attributes,
                },
            );

            try {
                return await obs.telemetry.withSpan(span, async () => {
                    try {
                        const result = await handler(event);
                        markSpanOk(span);
                        return result;
                    } catch (err) {
                        const errorAttributes: Record<
                            string,
                            string | number | boolean
                        > = {};
                        errorAttributes['runtime.event.type'] = String(
                            event.type,
                        );
                        applyErrorToSpan(span, err, errorAttributes);
                        throw err;
                    }
                });
            } catch (error) {
                // handler error already recorded; just rethrow
                throw error;
            }
        };
    }) as Middleware<Event>;

    middleware.kind = 'handler';
    middleware.name = 'withObservability';

    return middleware;
};
