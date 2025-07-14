/**
 * Validation middleware for workflow handlers
 *
 * Wraps a handler function with validation using Zod schemas
 */

import type { Event } from '../../core/types/events.js';
import { KernelError, type KernelErrorCode } from '../../core/errors.js';

// Import EventHandler type from runtime index
type EventHandler<E extends Event = Event> = (
    event: E,
) => Promise<Event | void> | Event | void;

/**
 * Type for any schema-like object that has a parse method
 */
export interface SchemaLike {
    parse: (data: unknown) => unknown;
    safeParse: (data: unknown) => { success: boolean; error?: unknown };
}

/**
 * Options for the validate middleware
 */
export interface ValidateOptions {
    /**
     * Whether to throw an error on validation failure
     * @default true
     */
    throwOnError?: boolean;

    /**
     * Custom error code to use when validation fails
     * @default 'VALIDATION_ERROR'
     */
    errorCode?: KernelErrorCode;
}

/**
 * Middleware factory for validation
 *
 * @param schema - The schema to validate against
 * @param options - Validation options
 * @returns A middleware function that applies validation
 *
 * @example
 * ```ts
 * const runtime = createRuntime(context, observability, {
 *   middleware: [withValidateMiddleware(schema)],
 * });
 * ```
 */
export function withValidateMiddleware(
    schema: SchemaLike,
    options?: ValidateOptions,
) {
    return function <E extends Event>(
        handler: EventHandler<E>,
    ): EventHandler<E> {
        return withValidate(schema, handler, options);
    };
}

/**
 * Wraps a handler function with validation using a schema
 *
 * @param schema - The schema to validate against (must have parse/safeParse methods like Zod)
 * @param handler - The handler function to wrap
 * @param options - Validation options
 * @returns A new handler function with validation
 *
 * @example
 * ```ts
 * // With Zod
 * import { z } from 'zod';
 *
 * const userSchema = z.object({
 *   id: z.string(),
 *   name: z.string(),
 *   age: z.number().min(0)
 * });
 *
 * workflow.on(UserEvent, withValidate(userSchema, async (event) => {
 *   // event.payload is now validated
 *   return NextEvent();
 * }));
 * ```
 */
export function withValidate<T extends Event>(
    schema: SchemaLike,
    handler: EventHandler<T>,
    options?: ValidateOptions,
): EventHandler<T> {
    const throwOnError = options?.throwOnError ?? true;
    // Usar KernelErrorCode válido
    const errorCode =
        options?.errorCode ?? ('VALIDATION_ERROR' as KernelErrorCode);

    return async (event: T) => {
        try {
            // Validate the event data (não payload)
            const result = schema.safeParse(event.data);

            if (!result.success) {
                if (throwOnError) {
                    throw new KernelError(
                        errorCode,
                        `Validation failed for event ${event.type}`,
                        { context: { validationError: result.error } },
                    );
                }
                // Se não lançar erro, apenas retorna undefined e NÃO chama o handler
                return undefined;
            }

            // Continue with handler
            return await handler(event);
        } catch (error) {
            // Re-throw KernelErrors
            if (error instanceof KernelError) {
                throw error;
            }

            // Wrap other errors
            throw new KernelError(
                'VALIDATION_ERROR',
                `Validation error: ${error instanceof Error ? error.message : String(error)}`,
                {
                    cause:
                        error instanceof Error
                            ? error
                            : new Error(String(error)),
                },
            );
        }
    };
}
