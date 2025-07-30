/**
 * @module observability/execution-timeline
 * @description Extensão funcional para tracking de timeline de execução
 *
 * Integra com o sistema funcional existente para fornecer:
 * - Timeline completo de execução
 * - State machine pattern para tracking
 * - Correlação com eventos existentes
 * - Performance tracking detalhado
 * - Mantém abordagem funcional do sistema
 */

import { getObservability } from './index.js';
import { createObservableOperation } from './observable.js';
import {
    EVENT_TYPES,
    type EventType,
    type AnyEvent,
} from '../core/types/events.js';
import { IdGenerator } from '../utils/id-generator.js';

// ============================================================================
// 1️⃣ TIPOS PARA TIMELINE DE EXECUÇÃO
// ============================================================================

/**
 * Estados da máquina de estado para execução
 */
export type ExecutionState =
    | 'initialized'
    | 'thinking'
    | 'acting'
    | 'observing'
    | 'completed'
    | 'failed'
    | 'paused';

/**
 * Transições válidas entre estados
 */
export type ExecutionTransition = {
    from: ExecutionState;
    to: ExecutionState;
    event: EventType;
    timestamp: number;
    metadata?: Record<string, unknown>;
};

/**
 * Entrada individual do timeline
 */
export type TimelineEntry = {
    id: string;
    timestamp: number;
    state: ExecutionState;
    eventType: EventType;
    eventData: unknown;
    correlationId?: string;
    duration?: number;
    metadata?: Record<string, unknown>;
};

/**
 * Timeline completo de execução
 */
export type ExecutionTimeline = {
    executionId: string;
    correlationId: string;
    startTime: number;
    endTime?: number;
    totalDuration?: number;
    currentState: ExecutionState;
    entries: TimelineEntry[];
    transitions: ExecutionTransition[];
    metadata: Record<string, unknown>;
};

/**
 * Contexto de tracking para operações
 */
export type TrackingContext = {
    executionId: string;
    correlationId: string;
    agentName?: string;
    operationName?: string;
    metadata?: Record<string, unknown>;
};

// ============================================================================
// 2️⃣ FUNÇÃO PURA PARA VALIDAÇÃO DE TRANSIÇÕES
// ============================================================================

/**
 * Mapeamento de transições válidas da máquina de estado
 */
const VALID_TRANSITIONS: Record<ExecutionState, ExecutionState[]> = {
    initialized: ['thinking', 'failed'],
    thinking: ['acting', 'completed', 'failed', 'paused'],
    acting: ['observing', 'completed', 'failed', 'paused'],
    observing: ['thinking', 'completed', 'failed', 'paused'],
    completed: [], // Estado final
    failed: [], // Estado final
    paused: ['thinking', 'acting', 'observing', 'failed'],
};

/**
 * Função pura para validar transições de estado
 */
export const isValidTransition = (
    from: ExecutionState,
    to: ExecutionState,
): boolean => {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
};

/**
 * Função pura para mapear evento para estado
 */
export const mapEventToState = (eventType: EventType): ExecutionState => {
    switch (eventType) {
        case EVENT_TYPES.AGENT_STARTED:
            return 'initialized';
        case EVENT_TYPES.AGENT_THINKING:
            return 'thinking';
        case EVENT_TYPES.TOOL_CALLED:
        case EVENT_TYPES.TOOL_CALL:
            return 'acting';
        case EVENT_TYPES.TOOL_RESULT:
        case EVENT_TYPES.AGENT_THOUGHT:
            return 'observing';
        case EVENT_TYPES.AGENT_COMPLETED:
        case EVENT_TYPES.WORKFLOW_COMPLETED:
            return 'completed';
        case EVENT_TYPES.AGENT_FAILED:
        case EVENT_TYPES.AGENT_ERROR:
        case EVENT_TYPES.TOOL_ERROR:
            return 'failed';
        default:
            return 'observing'; // Estado padrão para eventos não mapeados
    }
};

// ============================================================================
// 3️⃣ FUNÇÕES PURAS PARA MANIPULAÇÃO DE TIMELINE
// ============================================================================

/**
 * Função pura para criar timeline entry
 */
export const createTimelineEntry = (
    eventType: EventType,
    eventData: unknown,
    context: TrackingContext,
    options?: {
        duration?: number;
        metadata?: Record<string, unknown>;
    },
): TimelineEntry => {
    const state = mapEventToState(eventType);

    return {
        id: IdGenerator.eventId(),
        timestamp: Date.now(),
        state,
        eventType,
        eventData,
        correlationId: context.correlationId,
        duration: options?.duration,
        metadata: {
            ...context.metadata,
            ...options?.metadata,
        },
    };
};

/**
 * Função pura para criar transição de estado
 */
export const createTransition = (
    from: ExecutionState,
    to: ExecutionState,
    event: EventType,
    metadata?: Record<string, unknown>,
): ExecutionTransition => ({
    from,
    to,
    event,
    timestamp: Date.now(),
    metadata,
});

/**
 * Função pura para adicionar entrada ao timeline
 */
export const addTimelineEntry = (
    timeline: ExecutionTimeline,
    entry: TimelineEntry,
): ExecutionTimeline => {
    const newState = entry.state;
    const validTransition = isValidTransition(timeline.currentState, newState);

    if (!validTransition) {
        // Log warning mas continue - não quebre o fluxo
        const obs = getObservability();
        obs.handleSilentError(
            new Error(
                `Invalid state transition: ${timeline.currentState} -> ${newState}`,
            ),
            'timeline-tracking',
            { executionId: timeline.executionId, eventType: entry.eventType },
        );
    }

    const transition = createTransition(
        timeline.currentState,
        newState,
        entry.eventType,
        entry.metadata,
    );

    return {
        ...timeline,
        currentState: newState,
        entries: [...timeline.entries, entry],
        transitions: [...timeline.transitions, transition],
        endTime:
            newState === 'completed' || newState === 'failed'
                ? Date.now()
                : timeline.endTime,
        totalDuration:
            newState === 'completed' || newState === 'failed'
                ? Date.now() - timeline.startTime
                : timeline.totalDuration,
    };
};

/**
 * Função pura para criar timeline vazio
 */
export const createEmptyTimeline = (
    context: TrackingContext,
): ExecutionTimeline => ({
    executionId: context.executionId,
    correlationId: context.correlationId,
    startTime: Date.now(),
    currentState: 'initialized',
    entries: [],
    transitions: [],
    metadata: context.metadata || {},
});

// ============================================================================
// 4️⃣ TIMELINE MANAGER FUNCIONAL
// ============================================================================

/**
 * Timeline manager usando abordagem funcional
 */
export class TimelineManager {
    private timelines = new Map<string, ExecutionTimeline>();
    private obs = getObservability();

    /**
     * Cria novo timeline para execução
     */
    createTimeline = (context: TrackingContext): ExecutionTimeline => {
        const timeline = createEmptyTimeline(context);
        this.timelines.set(context.executionId, timeline);

        // Log inicial
        this.obs.logger.debug('Timeline created', {
            executionId: context.executionId,
            correlationId: context.correlationId,
        });

        return timeline;
    };

    /**
     * Adiciona evento ao timeline
     */
    trackEvent = (
        executionId: string,
        eventType: EventType,
        eventData: unknown,
        options?: {
            duration?: number;
            metadata?: Record<string, unknown>;
        },
    ): ExecutionTimeline | undefined => {
        const timeline = this.timelines.get(executionId);
        if (!timeline) {
            this.obs.handleSilentError(
                new Error(`Timeline not found: ${executionId}`),
                'timeline-tracking',
                { executionId, eventType },
            );
            return undefined;
        }

        const context: TrackingContext = {
            executionId: timeline.executionId,
            correlationId: timeline.correlationId,
            metadata: timeline.metadata,
        };

        const entry = createTimelineEntry(
            eventType,
            eventData,
            context,
            options,
        );
        const updatedTimeline = addTimelineEntry(timeline, entry);

        this.timelines.set(executionId, updatedTimeline);

        // Log transição
        this.obs.logger.debug('Timeline event tracked', {
            executionId,
            eventType,
            fromState: timeline.currentState,
            toState: updatedTimeline.currentState,
        });

        return updatedTimeline;
    };

    /**
     * Obtém timeline por ID
     */
    getTimeline = (executionId: string): ExecutionTimeline | undefined => {
        return this.timelines.get(executionId);
    };

    /**
     * Lista todos os timelines
     */
    getAllTimelines = (): ExecutionTimeline[] => {
        return Array.from(this.timelines.values());
    };

    /**
     * Remove timeline (cleanup)
     */
    removeTimeline = (executionId: string): boolean => {
        const exists = this.timelines.has(executionId);
        this.timelines.delete(executionId);

        if (exists) {
            this.obs.logger.debug('Timeline removed', { executionId });
        }

        return exists;
    };

    /**
     * Cleanup timelines antigos
     */
    cleanupOldTimelines = (maxAgeMs: number = 24 * 60 * 60 * 1000): number => {
        const now = Date.now();
        const toRemove: string[] = [];

        for (const [executionId, timeline] of this.timelines) {
            const age = now - timeline.startTime;
            if (age > maxAgeMs) {
                toRemove.push(executionId);
            }
        }

        toRemove.forEach((id) => this.timelines.delete(id));

        if (toRemove.length > 0) {
            this.obs.logger.info('Old timelines cleaned up', {
                removedCount: toRemove.length,
                maxAgeMs,
            });
        }

        return toRemove.length;
    };
}

// ============================================================================
// 5️⃣ INTEGRAÇÃO COM SISTEMA FUNCIONAL EXISTENTE
// ============================================================================

/**
 * Instância global do timeline manager
 */
let globalTimelineManager: TimelineManager | undefined;

/**
 * Obter timeline manager global
 */
export const getTimelineManager = (): TimelineManager => {
    if (!globalTimelineManager) {
        globalTimelineManager = new TimelineManager();
    }
    return globalTimelineManager;
};

/**
 * Wrapper funcional para operações com timeline tracking
 */
export const withTimelineTracking = <TInput, TOutput>(
    operationName: string,
    context: TrackingContext,
    trackingOptions?: {
        trackInput?: boolean;
        trackOutput?: boolean;
        trackDuration?: boolean;
        customMetadata?: Record<string, unknown>;
    },
) => {
    const timelineManager = getTimelineManager();

    return (operation: (input: TInput) => Promise<TOutput> | TOutput) => {
        return async (input: TInput): Promise<TOutput> => {
            // Garantir que timeline existe
            let timeline = timelineManager.getTimeline(context.executionId);
            if (!timeline) {
                timeline = timelineManager.createTimeline(context);
            }

            // Track início da operação
            const startTime = Date.now();
            timelineManager.trackEvent(
                context.executionId,
                EVENT_TYPES.AGENT_STARTED,
                trackingOptions?.trackInput ? input : { operationName },
                {
                    metadata: {
                        operationName,
                        phase: 'start',
                        ...trackingOptions?.customMetadata,
                    },
                },
            );

            try {
                const result = await operation(input);
                const duration = Date.now() - startTime;

                // Track sucesso
                timelineManager.trackEvent(
                    context.executionId,
                    EVENT_TYPES.AGENT_COMPLETED,
                    trackingOptions?.trackOutput ? result : { operationName },
                    {
                        duration: trackingOptions?.trackDuration
                            ? duration
                            : undefined,
                        metadata: {
                            operationName,
                            phase: 'success',
                            success: true,
                            ...trackingOptions?.customMetadata,
                        },
                    },
                );

                return result;
            } catch (error) {
                const duration = Date.now() - startTime;

                // Track erro
                timelineManager.trackEvent(
                    context.executionId,
                    EVENT_TYPES.AGENT_FAILED,
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        operationName,
                    },
                    {
                        duration: trackingOptions?.trackDuration
                            ? duration
                            : undefined,
                        metadata: {
                            operationName,
                            phase: 'error',
                            success: false,
                            errorType:
                                error instanceof Error
                                    ? error.name
                                    : 'UnknownError',
                            ...trackingOptions?.customMetadata,
                        },
                    },
                );

                throw error;
            }
        };
    };
};

/**
 * Composição com o sistema funcional existente
 */
export const createObservableTimelineOperation = <TInput, TOutput>(
    operation: (input: TInput) => Promise<TOutput> | TOutput,
    operationName: string,
    context: TrackingContext,
    observableOptions?: {
        retries?: number;
        timeout?: number;
        validators?: Array<(input: TInput) => boolean | string>;
        transformer?: (result: TOutput, input: TInput) => TOutput;
    },
    timelineOptions?: {
        trackInput?: boolean;
        trackOutput?: boolean;
        trackDuration?: boolean;
        customMetadata?: Record<string, unknown>;
    },
) => {
    // Aplicar timeline tracking primeiro
    const timelineWrapped = withTimelineTracking<TInput, TOutput>(
        operationName,
        context,
        timelineOptions,
    )(operation);

    // Aplicar observabilidade funcional existente
    return createObservableOperation<TInput, TOutput>(
        timelineWrapped,
        operationName,
        (input: TInput) => ({
            executionId: context.executionId,
            correlationId: context.correlationId,
            agentName: context.agentName,
            operationName,
            inputSize: JSON.stringify(input).length,
            ...context.metadata,
        }),
        observableOptions,
    );
};

// ============================================================================
// 6️⃣ UTILITÁRIOS PARA ANÁLISE DE TIMELINE
// ============================================================================

/**
 * Função pura para calcular estatísticas do timeline
 */
export const analyzeTimeline = (timeline: ExecutionTimeline) => {
    const totalEntries = timeline.entries.length;
    const stateDistribution = timeline.entries.reduce(
        (acc, entry) => {
            acc[entry.state] = (acc[entry.state] || 0) + 1;
            return acc;
        },
        {} as Record<ExecutionState, number>,
    );

    const durations = timeline.entries
        .filter((entry) => entry.duration !== undefined)
        .map((entry) => entry.duration!);

    const avgDuration =
        durations.length > 0
            ? durations.reduce((sum, d) => sum + d, 0) / durations.length
            : 0;

    const isCompleted = timeline.currentState === 'completed';
    const isFailed = timeline.currentState === 'failed';

    return {
        totalEntries,
        stateDistribution,
        avgDuration,
        isCompleted,
        isFailed,
        totalDuration: timeline.totalDuration,
        transitionCount: timeline.transitions.length,
        currentState: timeline.currentState,
    };
};

/**
 * Função pura para filtrar timeline por estado
 */
export const filterTimelineByState = (
    timeline: ExecutionTimeline,
    states: ExecutionState[],
): TimelineEntry[] => {
    return timeline.entries.filter((entry) => states.includes(entry.state));
};

/**
 * Função pura para filtrar timeline por tipo de evento
 */
export const filterTimelineByEventType = (
    timeline: ExecutionTimeline,
    eventTypes: EventType[],
): TimelineEntry[] => {
    return timeline.entries.filter((entry) =>
        eventTypes.includes(entry.eventType),
    );
};

/**
 * Função pura para obter timeline formatado para visualização
 */
export const formatTimelineForVisualization = (
    timeline: ExecutionTimeline,
    options?: {
        includeMetadata?: boolean;
        includeEventData?: boolean;
        maxEntries?: number;
    },
) => {
    const entries = options?.maxEntries
        ? timeline.entries.slice(-options.maxEntries)
        : timeline.entries;

    return {
        executionId: timeline.executionId,
        correlationId: timeline.correlationId,
        duration: timeline.totalDuration,
        currentState: timeline.currentState,
        analysis: analyzeTimeline(timeline),
        entries: entries.map((entry) => ({
            timestamp: entry.timestamp,
            state: entry.state,
            eventType: entry.eventType,
            duration: entry.duration,
            ...(options?.includeEventData && { eventData: entry.eventData }),
            ...(options?.includeMetadata && { metadata: entry.metadata }),
        })),
        transitions: timeline.transitions.map((transition) => ({
            from: transition.from,
            to: transition.to,
            event: transition.event,
            timestamp: transition.timestamp,
        })),
    };
};

// ============================================================================
// 7️⃣ INTEGRAÇÃO COM MIDDLEWARE DE OBSERVABILIDADE
// ============================================================================

/**
 * Cria middleware para automatically track timeline
 */
export const createTimelineTrackingMiddleware = (
    defaultContext?: Partial<TrackingContext>,
) => {
    const timelineManager = getTimelineManager();

    return function timelineMiddleware<E extends AnyEvent, R = AnyEvent | void>(
        handler: (ev: E) => Promise<R> | R,
        handlerName?: string,
    ) {
        return async function timelineTrackedHandler(ev: E): Promise<R | void> {
            const context: TrackingContext = {
                executionId: ev.metadata?.correlationId || IdGenerator.callId(),
                correlationId:
                    ev.metadata?.correlationId || IdGenerator.callId(),
                operationName: handlerName || 'anonymous',
                ...defaultContext,
            };

            // Garantir que timeline existe
            let timeline = timelineManager.getTimeline(context.executionId);
            if (!timeline) {
                timeline = timelineManager.createTimeline(context);
            }

            // Track início do evento
            const startTime = Date.now();
            timelineManager.trackEvent(
                context.executionId,
                ev.type as EventType,
                { eventData: ev.data, eventId: ev.id },
                {
                    metadata: {
                        handlerName,
                        eventType: ev.type,
                        phase: 'start',
                    },
                },
            );

            try {
                const result = await handler(ev);
                const duration = Date.now() - startTime;

                // Track sucesso
                timelineManager.trackEvent(
                    context.executionId,
                    EVENT_TYPES.AGENT_COMPLETED,
                    { result, handlerName },
                    {
                        duration,
                        metadata: {
                            handlerName,
                            eventType: ev.type,
                            phase: 'success',
                            success: true,
                        },
                    },
                );

                return result;
            } catch (error) {
                const duration = Date.now() - startTime;

                // Track erro
                timelineManager.trackEvent(
                    context.executionId,
                    EVENT_TYPES.AGENT_FAILED,
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        handlerName,
                    },
                    {
                        duration,
                        metadata: {
                            handlerName,
                            eventType: ev.type,
                            phase: 'error',
                            success: false,
                            errorType:
                                error instanceof Error
                                    ? error.name
                                    : 'UnknownError',
                        },
                    },
                );

                throw error;
            }
        };
    };
};
