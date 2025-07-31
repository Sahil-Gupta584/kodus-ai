/**
 * Enhanced Type System
 *
 * Provides improved type inference and utilities for better developer experience
 */

import type { Event, EventType, EventDef, EventPayloads } from './events.js';
import type { EventHandler } from './common-types.js';

/**
 * Enhanced event definition with better type inference
 */
export interface EnhancedEventDef<P = void, K extends EventType = EventType>
    extends EventDef<P, K> {
    /**
     * Create an event with the specified data and better type inference
     */
    with<T extends P & EventPayloads[K] = P & EventPayloads[K]>(
        data: T,
    ): Event<K>;

    /**
     * Create a typed handler for this event
     */
    handler<R = Event | void>(
        handler: (event: Event<K>) => R | Promise<R>,
    ): EventHandler<Event<K>>;

    /**
     * Type guard to check if an event matches this definition
     */
    matches(event: Event): event is Event<K>;
}

/**
 * Enhanced workflow event factory with better type inference
 */
export interface EnhancedWorkflowEventFactory {
    <P = void, K extends EventType = EventType>(
        type: K,
    ): EnhancedEventDef<P, K>;
    <P, K extends EventType = EventType>(
        type: K,
        schema?: (data: unknown) => data is P,
    ): EnhancedEventDef<P, K>;
}

/**
 * Infer event payload type from event definition
 */
export type InferEventPayload<T> =
    T extends EventDef<infer P, EventType> ? P : never;

/**
 * Infer event key type from event definition
 */
export type InferEventKey<T> = T extends EventDef<unknown, infer K> ? K : never;

/**
 * Infer handler return type
 */
export type InferHandlerReturn<T> =
    T extends EventHandler<Event<EventType>, infer R> ? R : never;

/**
 * Create a union type from multiple event definitions
 */
export type EventUnion<T extends readonly EventDef<unknown, EventType>[]> = {
    [K in keyof T]: T[K] extends EventDef<unknown, infer Type>
        ? Event<Type>
        : never;
}[number];

/**
 * Extract payload types from event union
 */
export type ExtractPayloads<T extends Event> =
    T extends Event<infer K> ? EventPayloads[K] : never;

/**
 * Type-safe event matcher
 */
export interface EventMatcher<T extends Event = Event> {
    /**
     * Match a specific event type
     */
    on<E extends T>(
        eventDef: EventDef<InferEventPayload<E>, InferEventKey<E>>,
        handler: (event: E) => Event | void | Promise<Event | void>,
    ): EventMatcher<T>;

    /**
     * Match multiple event types
     */
    onAny<E extends T>(
        eventDefs: Array<EventDef<InferEventPayload<E>, InferEventKey<E>>>,
        handler: (event: E) => Event | void | Promise<Event | void>,
    ): EventMatcher<T>;

    /**
     * Fallback handler for unmatched events
     */
    otherwise(
        handler: (event: T) => Event | void | Promise<Event | void>,
    ): EventMatcher<T>;

    /**
     * Build the matcher function
     */
    build(): (event: T) => Event | void | Promise<Event | void>;
}

/**
 * Conditional types for better type inference
 */
export type If<C extends boolean, T, F> = C extends true ? T : F;

export type IsVoid<T> = T extends void ? true : false;

export type IsPromise<T> = T extends Promise<unknown> ? true : false;

export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Deep readonly utility
 */
export type DeepReadonly<T> = {
    readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Make certain properties optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make certain properties required
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> &
    Required<Pick<T, K>>;

/**
 * Type-safe key paths
 */
export type KeyPath<T, K extends keyof T = keyof T> = K extends string
    ? T[K] extends object
        ? `${K}` | `${K}.${KeyPath<T[K]>}`
        : `${K}`
    : never;

/**
 * Get type by key path
 */
export type GetByPath<
    T,
    P extends string,
> = P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
        ? GetByPath<T[K], Rest>
        : never
    : P extends keyof T
      ? T[P]
      : never;

/**
 * Enhanced handler with better type inference
 */
export interface EnhancedHandler<
    TEvent extends Event = Event,
    TReturn = Event | void,
> {
    /**
     * The event handler function
     */
    handle: EventHandler<TEvent, TReturn>;

    /**
     * Event type this handler accepts
     */
    eventType: TEvent['type'];

    /**
     * Metadata about the handler
     */
    metadata?: {
        name?: string;
        description?: string;
        tags?: string[];
        timeout?: number;
        retries?: number;
    };
}

/**
 * Builder pattern for event handlers with type inference
 */
export interface HandlerBuilder<TEvent extends Event = Event> {
    /**
     * Set handler name and description
     */
    named(name: string, description?: string): HandlerBuilder<TEvent>;

    /**
     * Add tags for categorization
     */
    tagged(...tags: string[]): HandlerBuilder<TEvent>;

    /**
     * Set timeout for the handler
     */
    timeout(ms: number): HandlerBuilder<TEvent>;

    /**
     * Set retry configuration
     */
    retries(count: number): HandlerBuilder<TEvent>;

    /**
     * Build the enhanced handler
     */
    build<TReturn = Event | void>(
        handler: EventHandler<TEvent, TReturn>,
    ): EnhancedHandler<TEvent, TReturn>;
}

/**
 * Factory function for creating enhanced event definitions
 */
export function createEnhancedEvent<P = void, K extends EventType = EventType>(
    type: K,
    schema?: (data: unknown) => data is P,
): EnhancedEventDef<P, K> {
    const eventDef: EnhancedEventDef<P, K> = {
        type,

        with<T extends P & EventPayloads[K] = P & EventPayloads[K]>(
            data: T,
        ): Event<K> {
            return {
                type,
                data,
                ts: Date.now(),
            } as Event<K>;
        },

        handler<R = Event | void>(
            handler: (event: Event<K>) => R | Promise<R>,
        ): EventHandler<Event<K>> {
            return handler as EventHandler<Event<K>>;
        },

        matches(event: Event): event is Event<K> {
            if (event.type !== type) return false;
            return schema ? schema(event.data) : true;
        },

        include(event: Event<EventType>): event is Event<K> {
            if (event.type !== type) return false;
            return schema ? schema(event.data) : true;
        },
    };

    return eventDef;
}

/**
 * Create an event matcher with type-safe chaining
 */
export function createEventMatcher<T extends Event = Event>(): EventMatcher<T> {
    const handlers = new Map<
        string,
        (event: T) => Event | void | Promise<Event | void>
    >();
    let fallbackHandler:
        | ((event: T) => Event | void | Promise<Event | void>)
        | undefined;

    const matcher: EventMatcher<T> = {
        on<E extends T>(
            eventDef: EventDef<InferEventPayload<E>, InferEventKey<E>>,
            handler: (event: E) => Event | void | Promise<Event | void>,
        ) {
            handlers.set(eventDef.type, ((event: T) =>
                handler(event as unknown as E)) as (
                event: T,
            ) => Event | void | Promise<Event | void>);
            return matcher;
        },

        onAny<E extends T>(
            eventDefs: Array<EventDef<InferEventPayload<E>, InferEventKey<E>>>,
            handler: (event: E) => Event | void | Promise<Event | void>,
        ) {
            for (const eventDef of eventDefs) {
                handlers.set(eventDef.type, ((event: T) =>
                    handler(event as unknown as E)) as (
                    event: T,
                ) => Event | void | Promise<Event | void>);
            }
            return matcher;
        },

        otherwise(handler: (event: T) => Event | void | Promise<Event | void>) {
            fallbackHandler = handler;
            return matcher;
        },

        build() {
            return (event: T) => {
                const handler = handlers.get(event.type);
                if (handler) {
                    return handler(event);
                }
                if (fallbackHandler) {
                    return fallbackHandler(event);
                }
                return undefined;
            };
        },
    };

    return matcher;
}

/**
 * Create a handler builder with fluent interface
 */
export function createHandler<
    TEvent extends Event = Event,
>(): HandlerBuilder<TEvent> {
    const metadata: EnhancedHandler<TEvent>['metadata'] = {};

    const builder: HandlerBuilder<TEvent> = {
        named(name: string, description?: string) {
            metadata.name = name;
            metadata.description = description;
            return builder;
        },

        tagged(...tags: string[]) {
            metadata.tags = [...(metadata.tags || []), ...tags];
            return builder;
        },

        timeout(ms: number) {
            metadata.timeout = ms;
            return builder;
        },

        retries(count: number) {
            metadata.retries = count;
            return builder;
        },

        build<TReturn = Event | void>(
            handler: EventHandler<TEvent, TReturn>,
        ): EnhancedHandler<TEvent, TReturn> {
            return {
                handle: handler,
                eventType: '' as TEvent['type'], // Will be set when attached
                metadata: { ...metadata },
            };
        },
    };

    return builder;
}

/**
 * Type utilities for working with async operations
 */
// Tipos para operações assíncronas
export type MaybePromise<T> = T | Promise<T>;

export type PromiseValue<T> = T extends Promise<infer U> ? U : T;

export type AllValues<T extends readonly unknown[]> = {
    [K in keyof T]: PromiseValue<T[K]>;
};

export type Result<T, E = Error> =
    | { success: true; data: T }
    | { success: false; error: E };

/**
 * Enhanced workflow event factory implementation
 */
export const enhancedWorkflowEvent: EnhancedWorkflowEventFactory = <
    P = void,
    K extends EventType = EventType,
>(
    type: K,
    schema?: (data: unknown) => data is P,
) => {
    return createEnhancedEvent<P, K>(type, schema);
};
