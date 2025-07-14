/**
 * Error types used in the SDK
 *
 * These types define the error system that provides structured error handling
 * for the SDK's operations.
 */
import { z } from 'zod';

/**
 * Base error code schema and type
 */
export const errorCodeSchema = z.enum([
    'VALIDATION_ERROR',
    'TIMEOUT_ERROR',
    'EXECUTION_ERROR',
    'NOT_FOUND_ERROR',
    'ARGUMENT_ERROR',
    'INTERNAL_ERROR',
    'NETWORK_ERROR',
    'PERMISSION_ERROR',
    'CONFIGURATION_ERROR',
    'DEPENDENCY_ERROR',
    'UNKNOWN_ERROR',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/**
 * Error severity schema and type
 */
export const errorSeveritySchema = z.enum([
    'DEBUG',
    'INFO',
    'WARNING',
    'ERROR',
    'CRITICAL',
]);
export type ErrorSeverity = z.infer<typeof errorSeveritySchema>;

/**
 * Error metadata schema and type
 */
export const errorMetadataSchema = z.object({
    code: errorCodeSchema,
    severity: errorSeveritySchema.default('ERROR'),
    retryable: z.boolean().default(false),
    source: z.string().optional(),
    details: z.record(z.unknown()).optional(),
    stackTrace: z.string().optional(),
    timestamp: z.number().optional(),
});
export type ErrorMetadata = z.infer<typeof errorMetadataSchema>;

/**
 * Tool error schema and type
 */
export const toolErrorSchema = z.object({
    code: errorCodeSchema,
    message: z.string(),
    toolId: z.string().optional(),
    toolName: z.string().optional(),
    argumentName: z.string().optional(),
    validationErrors: z.record(z.string()).optional(),
    metadata: errorMetadataSchema.optional(),
    cause: z.unknown().optional(),
});
export type ToolErrorData = z.infer<typeof toolErrorSchema>;

/**
 * Validation error schema and type
 */
export const validationErrorSchema = z.object({
    code: z.literal('VALIDATION_ERROR'),
    message: z.string(),
    validationErrors: z.record(z.string()),
    metadata: errorMetadataSchema.optional(),
});
export type ValidationErrorData = z.infer<typeof validationErrorSchema>;

/**
 * Timeout error schema and type
 */
export const timeoutErrorSchema = z.object({
    code: z.literal('TIMEOUT_ERROR'),
    message: z.string(),
    timeoutMs: z.number(),
    operationName: z.string().optional(),
    metadata: errorMetadataSchema.optional(),
});
export type TimeoutErrorData = z.infer<typeof timeoutErrorSchema>;

/**
 * Not found error schema and type
 */
export const notFoundErrorSchema = z.object({
    code: z.literal('NOT_FOUND_ERROR'),
    message: z.string(),
    resourceType: z.string().optional(),
    resourceId: z.string().optional(),
    metadata: errorMetadataSchema.optional(),
});
export type NotFoundErrorData = z.infer<typeof notFoundErrorSchema>;
