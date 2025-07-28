/**
 * MCP Protocol Helper Functions
 *
 * This module provides utilities for creating MCP-compliant responses
 * according to the Model Context Protocol specification.
 */

import { z } from 'zod';
import { PinoLoggerService } from '../../services/logger/pino.service';

/**
 * Create a successful MCP tool response
 */
export function createToolResponse(
    data: any,
    mimeType = 'application/json',
): { content: Array<{ type: 'text'; text: string }> } {
    return {
        content: [
            {
                type: 'text',
                text:
                    typeof data === 'string'
                        ? data
                        : JSON.stringify(data, null, 2),
            },
        ],
    };
}

/**
 * Create an error response following JSON-RPC 2.0 error codes
 */
export function createErrorResponse(
    code: number,
    message: string,
    data: any = null,
): never {
    const error: any = {
        jsonrpc: '2.0',
        error: {
            code,
            message: message || 'Unknown error',
        },
    };

    if (data !== null && data !== undefined) {
        error.error.data = data;
    }

    throw error;
}

/**
 * Standard JSON-RPC 2.0 error codes
 */
export const ErrorCodes = {
    // JSON-RPC 2.0 standard errors
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,

    // MCP-specific errors (using implementation-defined range)
    RESOURCE_NOT_FOUND: -32002,
    RESOURCE_ACCESS_DENIED: -32003,
    RESOURCE_UNAVAILABLE: -32004,
    BACKEND_ERROR: -32005,
} as const;

/**
 * Create a paginated response with cursor support
 */
export function createPaginatedResponse(
    items: any[],
    options: { cursor?: string; limit?: number } = {},
): { content: Array<{ type: 'text'; text: string }> } {
    const { cursor, limit = 10 } = options;

    let startIndex = 0;
    if (cursor) {
        // Decode cursor (base64 encoded index)
        try {
            startIndex = parseInt(
                Buffer.from(cursor, 'base64').toString('utf8'),
                10,
            );
        } catch (e) {
            throw createErrorResponse(
                ErrorCodes.INVALID_PARAMS,
                'Invalid cursor',
            );
        }
    }

    const endIndex = startIndex + limit;
    const paginatedItems = items.slice(startIndex, endIndex);
    const hasMore = endIndex < items.length;

    const response: any = {
        items: paginatedItems,
        total: items.length,
    };

    if (hasMore) {
        // Create cursor for next page (base64 encoded index)
        response.nextCursor = Buffer.from(endIndex.toString()).toString(
            'base64',
        );
    }

    return createToolResponse(response);
}

/**
 * Wrap an async tool handler with proper error handling
 * Returns the correct type expected by MCP SDK
 */
export function wrapToolHandler<T = any>(
    handler: (args: T, extra?: any) => Promise<any>,
): (
    args: T,
    extra?: any,
) => Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    return async (args: T, extra?: any) => {
        try {
            const result = await handler(args, extra);

            // Use createToolResponse to format the result
            return createToolResponse(result);
        } catch (error: any) {
            // Ensure error is properly serialized as JSON
            const errorResponse = serializeErrorToJSON(error);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(errorResponse, null, 2),
                    },
                ],
                isError: true,
            };
        }
    };
}

/**
 * Serialize any error to a proper JSON error response
 */
function serializeErrorToJSON(error: any): any {
    // If it's already a JSON-RPC error, format it properly
    if (error.jsonrpc === '2.0' && error.error) {
        return error;
    }

    // If it has a code, it might be a JSON-RPC error without jsonrpc field
    if (error.code && typeof error.code === 'number') {
        return {
            jsonrpc: '2.0',
            error: {
                code: error.code,
                message: error.message || 'Unknown error',
                data: error.data,
            },
        };
    }

    // Handle specific error types based on message content
    const message = error.message || error.toString() || 'Unknown error';

    if (message.includes('not found')) {
        return {
            jsonrpc: '2.0',
            error: {
                code: ErrorCodes.RESOURCE_NOT_FOUND,
                message: message,
                data: { resource: error.resource || 'unknown' },
            },
        };
    }

    if (message.includes('unauthorized') || message.includes('forbidden')) {
        return {
            jsonrpc: '2.0',
            error: {
                code: ErrorCodes.RESOURCE_ACCESS_DENIED,
                message: 'Access denied to resource',
            },
        };
    }

    if (message.includes('backend') || message.includes('API')) {
        return {
            jsonrpc: '2.0',
            error: {
                code: ErrorCodes.BACKEND_ERROR,
                message: 'Backend service unavailable',
                data: {
                    service: error.service || 'unknown',
                    originalError: message,
                },
            },
        };
    }

    // Default to internal error
    return {
        jsonrpc: '2.0',
        error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'An internal error occurred',
            data: { originalError: message },
        },
    };
}

/**
 * Validate tool arguments against a schema
 */
export function validateArgs<T>(
    args: any,
    schema: z.ZodSchema<T> | { validate: (args: any) => any },
): T {
    try {
        if ('parse' in schema) {
            // Zod schema
            return schema.parse(args);
        } else if ('validate' in schema) {
            // Generic validation method
            const result = schema.validate(args);
            if (!result.success) {
                throw new Error(result.error);
            }
            return result.data;
        }
        return args;
    } catch (error: any) {
        throw createErrorResponse(
            ErrorCodes.INVALID_PARAMS,
            'Invalid parameters',
            { validation: error.errors || error.message },
        );
    }
}

/**
 * Log MCP tool invocation for monitoring
 */
export function logToolInvocation(
    toolName: string,
    args: any,
    extra: any,
    logger: PinoLoggerService,
): number {
    logger.log({
        message: 'MCP tool invoked',
        context: 'McpProtocol',
        metadata: {
            tool: toolName,
            args: Object.keys(args).length > 0 ? args : undefined,
            requestId: extra?.requestId,
        },
    });

    return Date.now(); // Return start time for duration tracking
}

/**
 * Log tool completion with duration
 */
export function logToolCompletion(
    toolName: string,
    startTime: number,
    logger: PinoLoggerService,
    error?: any,
): void {
    const duration = Date.now() - startTime;

    if (error) {
        logger.error({
            message: 'MCP tool failed',
            context: 'McpProtocol',
            error,
            metadata: {
                tool: toolName,
                duration,
            },
        });
    } else {
        logger.log({
            message: 'MCP tool completed',
            context: 'McpProtocol',
            metadata: {
                tool: toolName,
                duration,
            },
        });
    }
}
