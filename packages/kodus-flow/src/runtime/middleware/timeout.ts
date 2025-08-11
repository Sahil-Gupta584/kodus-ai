/**
 * Timeout middleware for workflow handlers
 *
 * Wraps a handler function with a timeout that throws KernelError('TIMEOUT')
 * if the handler doesn't complete within the specified time.
 */

import type { Event, AnyEvent } from '../../core/types/events.js';
import type { EventHandler } from '../../core/types/common-types.js';
import { KernelError } from '../../core/errors.js';
import { DEFAULT_TIMEOUT_MS } from '../constants.js';
import type { Middleware, MiddlewareFactoryType } from './types.js';

/**
 * Options for the timeout middleware
 */
export interface TimeoutOptions {
    /**
     * Timeout in milliseconds
     * @default 30000 (30 seconds)
     */
    timeoutMs?: number;
}

/**
 * Wraps a handler function with a timeout
 *
 * @param handler - The handler function to wrap
 * @param options - Timeout options
 * @returns A new handler function with timeout
 *
 * @example
 * ```ts
 * workflow.on(MyEvent, withTimeout(async (event) => {
 *   // This handler will throw KernelError('TIMEOUT') if it takes longer than 5 seconds
 *   await someSlowOperation();
 *   return NextEvent();
 * }, { timeoutMs: 5000 }));
 * ```
 */
export const withTimeout: MiddlewareFactoryType<
    TimeoutOptions | undefined,
    Event
> = (options: TimeoutOptions | undefined) => {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const middleware = (<T extends Event>(
        handler: EventHandler<T>,
    ): EventHandler<T> => {
        const withTimeoutWrapped = (event: T): Promise<void | AnyEvent> => {
            return new Promise<void | AnyEvent>((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(
                        new KernelError(
                            'TIMEOUT_EXCEEDED',
                            `Handler timed out after ${timeoutMs}ms`,
                        ),
                    );
                }, timeoutMs);

                Promise.resolve(handler(event))
                    .then((result) => {
                        clearTimeout(timeoutId);
                        resolve(result);
                    })
                    .catch((error) => {
                        clearTimeout(timeoutId);
                        reject(error);
                    });
            });
        };

        return withTimeoutWrapped;
    }) as Middleware<Event>;

    middleware.kind = 'pipeline';
    middleware.name = 'withTimeout';

    return middleware;
};
