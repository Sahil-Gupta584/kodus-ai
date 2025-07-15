/**
 * @file Zod to JSON Schema Converter
 * @description Utilitário para conversão automática de Zod schemas para JSON Schema
 */

import { z } from 'zod';
import type { ToolJSONSchema } from '../types/tool-types.js';

// Tipo para a API interna do Zod
type ZodInternalDef = {
    typeName: string;
    checks?: unknown[];
    type?: z.ZodSchema;
    shape?: () => Record<string, z.ZodSchema>;
    values?: unknown[];
    value?: unknown;
    options?: z.ZodSchema[];
    innerType?: z.ZodSchema;
    defaultValue?: () => unknown;
    valueType?: z.ZodSchema;
};

/**
 * Converte um Zod schema para JSON Schema compatível com LLMs
 */
export function zodToJSONSchema(
    zodSchema: z.ZodSchema,
    name: string,
    description: string,
): ToolJSONSchema {
    const jsonSchema = zodSchemaToJsonSchemaObject(zodSchema);

    return {
        name,
        description,
        parameters: {
            type: 'object',
            properties:
                (jsonSchema.properties as Record<string, unknown>) || {},
            required: (jsonSchema.required as string[]) || [],
            additionalProperties:
                (jsonSchema.additionalProperties as boolean) ?? false,
        },
    };
}

/**
 * Converte recursivamente um Zod schema para objeto JSON Schema
 */
function zodSchemaToJsonSchemaObject(
    schema: z.ZodSchema,
): Record<string, unknown> {
    const zodType = schema._def as unknown as ZodInternalDef;

    switch (zodType.typeName) {
        case 'ZodString':
            return {
                type: 'string',
                ...(zodType.checks && getStringConstraints(zodType.checks)),
            };

        case 'ZodNumber':
            return {
                type: 'number',
                ...(zodType.checks && getNumberConstraints(zodType.checks)),
            };

        case 'ZodBoolean':
            return { type: 'boolean' };

        case 'ZodArray':
            if (!zodType.type) {
                return { type: 'array' };
            }
            return {
                type: 'array',
                items: zodSchemaToJsonSchemaObject(zodType.type),
            };

        case 'ZodObject':
            const properties: Record<string, Record<string, unknown>> = {};
            const required: string[] = [];

            if (!zodType.shape) {
                return { type: 'object' };
            }

            for (const [key, value] of Object.entries(zodType.shape())) {
                properties[key] = zodSchemaToJsonSchemaObject(
                    value as z.ZodSchema,
                );

                // Verifica se o campo é obrigatório
                if (!isOptional(value as z.ZodSchema)) {
                    required.push(key);
                }
            }

            return {
                type: 'object',
                properties,
                required: required.length > 0 ? required : undefined,
                additionalProperties: false,
            };

        case 'ZodEnum':
            return {
                type: 'string',
                enum: zodType.values,
            };

        case 'ZodLiteral':
            return {
                type: typeof zodType.value,
                const: zodType.value,
            };

        case 'ZodUnion':
            if (!zodType.options) {
                return { type: 'object' };
            }
            return {
                anyOf: zodType.options.map((option: z.ZodSchema) =>
                    zodSchemaToJsonSchemaObject(option),
                ),
            };

        case 'ZodOptional':
            if (!zodType.innerType) {
                return { type: 'object' };
            }
            return zodSchemaToJsonSchemaObject(zodType.innerType);

        case 'ZodNullable':
            if (!zodType.innerType) {
                return { type: 'null' };
            }
            const innerSchema = zodSchemaToJsonSchemaObject(zodType.innerType);
            return {
                anyOf: [innerSchema, { type: 'null' }],
            };

        case 'ZodDefault':
            if (!zodType.innerType) {
                return { type: 'object' };
            }
            const defaultSchema = zodSchemaToJsonSchemaObject(
                zodType.innerType,
            );
            return {
                ...defaultSchema,
                default: zodType.defaultValue?.() || undefined,
            };

        case 'ZodRecord':
            return {
                type: 'object',
                additionalProperties: zodType.valueType
                    ? zodSchemaToJsonSchemaObject(zodType.valueType)
                    : true,
            };

        case 'ZodUnknown':
        case 'ZodAny':
            return {};

        default:
            // Fallback para tipos não suportados
            return { type: 'object' };
    }
}

/**
 * Verifica se um schema Zod é opcional
 */
function isOptional(schema: z.ZodSchema): boolean {
    const zodType = schema._def as unknown as ZodInternalDef;
    return (
        zodType.typeName === 'ZodOptional' || zodType.typeName === 'ZodDefault'
    );
}

/**
 * Extrai constraints de string do Zod
 */
function getStringConstraints(checks: unknown[]): Record<string, unknown> {
    const constraints: Record<string, unknown> = {};

    for (const check of checks) {
        const typedCheck = check as {
            kind: string;
            value?: number;
            regex?: RegExp;
        };
        switch (typedCheck.kind) {
            case 'min':
                constraints.minLength = typedCheck.value;
                break;
            case 'max':
                constraints.maxLength = typedCheck.value;
                break;
            case 'length':
                constraints.minLength = typedCheck.value;
                constraints.maxLength = typedCheck.value;
                break;
            case 'email':
                constraints.format = 'email';
                break;
            case 'url':
                constraints.format = 'uri';
                break;
            case 'uuid':
                constraints.format = 'uuid';
                break;
            case 'regex':
                constraints.pattern = typedCheck.regex?.source;
                break;
        }
    }

    return constraints;
}

/**
 * Extrai constraints de número do Zod
 */
function getNumberConstraints(checks: unknown[]): Record<string, unknown> {
    const constraints: Record<string, unknown> = {};

    for (const check of checks) {
        const typedCheck = check as { kind: string; value?: number };
        switch (typedCheck.kind) {
            case 'min':
                constraints.minimum = typedCheck.value;
                break;
            case 'max':
                constraints.maximum = typedCheck.value;
                break;
            case 'int':
                constraints.type = 'integer';
                break;
        }
    }

    return constraints;
}

/**
 * Valida se um valor está conforme o schema Zod
 */
export function validateWithZod<T>(
    schema: z.ZodSchema<T>,
    value: unknown,
): { success: true; data: T } | { success: false; error: string } {
    // ✅ Zod v4: safeParse() é mais performático que parse() + try/catch
    const result = schema.safeParse(value);

    if (result.success) {
        return { success: true, data: result.data };
    } else {
        const message = (
            result.error as unknown as {
                errors: Array<{ path: string[]; message: string }>;
            }
        ).errors
            .map((err) => `${err.path.join('.')}: ${err.message}`)
            .join(', ');
        return { success: false, error: message };
    }
}

/**
 * Valida entrada de tool usando schema Zod
 */
export function validateToolInput<T>(
    schema: z.ZodSchema<T>,
    input: unknown,
): T {
    // ✅ Zod v4: safeParse() é mais performático que parse() + try/catch
    const result = schema.safeParse(input);

    if (result.success) {
        return result.data;
    } else {
        const message = (
            result.error as unknown as {
                errors: Array<{ path: string[]; message: string }>;
            }
        ).errors
            .map((err) => `${err.path.join('.')}: ${err.message}`)
            .join(', ');
        throw new Error(`Tool input validation failed: ${message}`);
    }
}
