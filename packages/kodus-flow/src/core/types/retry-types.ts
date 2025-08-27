// /**
//  * Retry types used in the SDK
//  *
//  * These types define the retry system that provides fault tolerance
//  * for the SDK's operations.
//  */
// import { z } from 'zod';

// /**
//  * Retry options schema and type
//  */
// export const retryOptionsSchema = z.object({
//     maxRetries: z.number().int().nonnegative().default(2),
//     initialDelayMs: z.number().int().positive().default(100),
//     maxDelayMs: z.number().int().positive().default(2000),
//     maxTotalMs: z.number().int().positive().default(60_000),
//     backoffFactor: z.number().positive().default(2),
//     jitter: z.boolean().default(true),
//     retryableErrorCodes: z
//         .array(
//             z.enum([
//                 'NETWORK_ERROR',
//                 'TIMEOUT_ERROR',
//                 'TIMEOUT_EXCEEDED',
//                 'DEPENDENCY_ERROR',
//             ] as const),
//         )
//         .default(['NETWORK_ERROR', 'TIMEOUT_ERROR', 'TIMEOUT_EXCEEDED']),
//     retryableStatusCodes: z
//         .array(z.number().int())
//         .default([408, 429, 500, 502, 503, 504]),
//     retryPredicate: z.instanceof(Function).optional(),
// });
// export type RetryOptions = z.infer<typeof retryOptionsSchema>;

// /**
//  * Retry state schema and type
//  */
// export const retryStateSchema = z.object({
//     attempt: z.number().int().nonnegative(),
//     maxRetries: z.number().int().nonnegative(),
//     delayMs: z.number().int().nonnegative(),
//     error: z.unknown().optional(),
//     startTime: z.number(),
//     totalElapsedMs: z.number().nonnegative(),
// });
// export type RetryState = z.infer<typeof retryStateSchema>;

// /**
//  * Retry result schema and type
//  */
// export const retryResultSchema = z.object({
//     success: z.boolean(),
//     value: z.unknown().optional(),
//     error: z.unknown().optional(),
//     attempts: z.number().int().positive(),
//     totalElapsedMs: z.number().nonnegative(),
// });
// export type RetryResult<T = unknown> = z.infer<typeof retryResultSchema> & {
//     value?: T;
// };

// /**
//  * Retry event type schema and type
//  */
// export const retryEventTypeSchema = z.enum([
//     'RETRY_STARTED',
//     'RETRY_ATTEMPT',
//     'RETRY_SUCCEEDED',
//     'RETRY_FAILED',
//     'RETRY_ABORTED',
// ]);
// export type RetryEventType = z.infer<typeof retryEventTypeSchema>;

// /**
//  * Retry event schema and type
//  */
// export const retryEventSchema = z.object({
//     type: retryEventTypeSchema,
//     timestamp: z.number(),
//     operationName: z.string(),
//     attempt: z.number().int().nonnegative(),
//     maxRetries: z.number().int().nonnegative(),
//     delayMs: z.number().int().nonnegative().optional(),
//     error: z
//         .object({
//             message: z.string().optional(),
//             code: z.string().optional(),
//             stack: z.string().optional(),
//         })
//         .optional(),
//     totalElapsedMs: z.number().nonnegative().optional(),
// });
// export type RetryEvent = z.infer<typeof retryEventSchema>;
