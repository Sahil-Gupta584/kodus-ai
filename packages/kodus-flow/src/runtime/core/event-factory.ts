/**
 * @module runtime/core/event-factory
 * @description Event Factory - Factory para criar eventos tipados
 *
 * Implementa a funcionalidade de factory de eventos que estava no runtime original:
 * - workflowEvent() para criar eventos tipados
 * - EventDef interface
 * - Type safety para eventos
 */

import type {
    AnyEvent,
    EventType,
    Event,
    EventPayloads,
    EventDef,
} from '../../core/types/events.js';
import { IdGenerator } from '../../utils/id-generator.js';

// ===== WORKFLOW EVENT FACTORY TYPE =====
type WorkflowEventFactory = <P = void, K extends EventType = EventType>(
    name?: K,
) => EventDef<P, K>;

/**
 * Factory de eventos para workflow
 */
export const workflowEvent: WorkflowEventFactory = <
    P = void,
    K extends EventType = EventType,
>(
    name?: K,
) => {
    const type = name ?? (IdGenerator.callId().slice(5) as K);

    const def: EventDef<P, K> = {
        type: type,
        with(data: P): Event<K> {
            return {
                id: IdGenerator.callId(),
                type: type,
                threadId: `workflow-${Date.now()}`,
                data: (data ?? {}) as EventPayloads[K],
                ts: Date.now(),
            };
        },
        include(ev): ev is Event<K> {
            return ev.type === type;
        },
    };
    return def;
};

/**
 * Verificar se um evento é de um tipo específico
 */
export const isEventType = <T extends EventType>(
    event: AnyEvent,
    type: T,
): event is AnyEvent & { type: T } => {
    return event.type === type;
};

/**
 * Verificar se um evento é de um grupo de tipos
 */
export const isEventTypeGroup = (
    event: AnyEvent,
    types: EventType[],
): boolean => {
    return types.includes(event.type);
};

/**
 * Extrair dados de um evento com type safety
 */
export const extractEventData = <T extends EventType>(
    event: AnyEvent,
    type: T,
): EventPayloads[T] | undefined => {
    if (event.type === type) {
        return event.data === undefined
            ? ({} as EventPayloads[T])
            : (event.data as EventPayloads[T]);
    }
    return undefined;
};
