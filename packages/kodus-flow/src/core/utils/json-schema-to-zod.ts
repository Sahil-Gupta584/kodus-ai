/**
 * @file JSON Schema to Zod Converter
 * @description Utilitário para conversão de JSON Schema para Zod schemas
 *
 * MELHORIAS:
 * - Suporte completo a tipos MCP
 * - Validações avançadas
 * - Melhor tratamento de erros
 * - Compatibilidade com LLMs
 */

import { z } from 'zod';

/**
 * Converte JSON Schema para Zod schema
 * Suporta tipos básicos: string, number, boolean, object, array
 * + tipos avançados: file, uri, email, etc.
 */
export function jsonSchemaToZod(jsonSchema: unknown): z.ZodSchema {
    if (!jsonSchema || typeof jsonSchema !== 'object') {
        return z.any();
    }

    const schema = jsonSchema as Record<string, unknown>;

    // Se é um objeto com properties, é um object schema
    if (schema.properties && typeof schema.properties === 'object') {
        const properties = schema.properties as Record<string, unknown>;
        const required = (schema.required as string[]) || [];

        const shape: Record<string, z.ZodSchema> = {};

        for (const [key, propSchema] of Object.entries(properties)) {
            const zodProp = jsonSchemaPropertyToZod(propSchema);

            // Se não está na lista de required, torna opcional
            if (!required.includes(key)) {
                shape[key] = zodProp.optional();
            } else {
                shape[key] = zodProp;
            }
        }

        return z.object(shape);
    }

    // Se tem type, converte baseado no tipo
    if (schema.type && typeof schema.type === 'string') {
        return jsonSchemaTypeToZod(schema);
    }

    // Fallback para schema desconhecido
    return z.any();
}

/**
 * Converte uma propriedade JSON Schema para Zod
 */
function jsonSchemaPropertyToZod(propSchema: unknown): z.ZodSchema {
    if (!propSchema || typeof propSchema !== 'object') {
        return z.any();
    }

    const schema = propSchema as Record<string, unknown>;

    // Se tem type, usa o conversor de tipo
    if (schema.type && typeof schema.type === 'string') {
        return jsonSchemaTypeToZod(schema);
    }

    // Se tem enum, é um enum
    if (schema.enum && Array.isArray(schema.enum)) {
        const enumValues = schema.enum as unknown[];
        if (enumValues.every((v) => typeof v === 'string')) {
            return z.enum(enumValues as [string, ...string[]]);
        }
        if (enumValues.every((v) => typeof v === 'number')) {
            // Para enums numéricos, usamos union de literals
            const numberLiterals = enumValues as number[];
            return z.union(
                numberLiterals.map((n) => z.literal(n)) as [
                    z.ZodLiteral<number>,
                    ...z.ZodLiteral<number>[],
                ],
            );
        }
    }

    // Se tem oneOf/anyOf, tenta converter para union
    if (schema.oneOf && Array.isArray(schema.oneOf)) {
        const options = (schema.oneOf as unknown[]).map(jsonSchemaToZod);
        if (options.length >= 2) {
            return z.union(
                options as [z.ZodSchema, z.ZodSchema, ...z.ZodSchema[]],
            );
        }
    }

    if (schema.anyOf && Array.isArray(schema.anyOf)) {
        const options = (schema.anyOf as unknown[]).map(jsonSchemaToZod);
        if (options.length >= 2) {
            return z.union(
                options as [z.ZodSchema, z.ZodSchema, ...z.ZodSchema[]],
            );
        }
    }

    // Se tem allOf, tenta intersection (simplificado)
    if (schema.allOf && Array.isArray(schema.allOf)) {
        const schemas = (schema.allOf as unknown[]).map(jsonSchemaToZod);
        if (schemas.length >= 2) {
            // Para evitar problemas de tipo, usa apenas os primeiros 2 schemas
            const first = schemas[0];
            const second = schemas[1];
            if (first && second) {
                return z.intersection(first, second);
            }
        }
    }

    return z.any();
}

/**
 * Converte um tipo JSON Schema para Zod
 */
function jsonSchemaTypeToZod(schema: Record<string, unknown>): z.ZodSchema {
    const type = schema.type as string;

    switch (type) {
        case 'string':
            let stringSchema = z.string();

            // Adiciona constraints se existirem
            if (schema.minLength && typeof schema.minLength === 'number') {
                stringSchema = stringSchema.min(schema.minLength as number);
            }
            if (schema.maxLength && typeof schema.maxLength === 'number') {
                stringSchema = stringSchema.max(schema.maxLength as number);
            }
            if (schema.pattern && typeof schema.pattern === 'string') {
                stringSchema = stringSchema.regex(
                    new RegExp(schema.pattern as string),
                );
            }

            // Suporte a formatos específicos do MCP
            if (schema.format && typeof schema.format === 'string') {
                const format = schema.format as string;
                switch (format) {
                    case 'uri':
                    case 'uri-reference':
                        stringSchema = stringSchema.url();
                        break;
                    case 'email':
                        stringSchema = stringSchema.email();
                        break;
                    case 'date-time':
                        stringSchema = stringSchema.datetime();
                        break;
                    case 'date':
                        stringSchema = stringSchema.date();
                        break;
                    case 'time':
                        stringSchema = stringSchema.regex(
                            /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/,
                        );
                        break;
                    case 'uuid':
                        stringSchema = stringSchema.uuid();
                        break;
                    case 'ipv4':
                        stringSchema = stringSchema.regex(
                            /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
                        );
                        break;
                    case 'ipv6':
                        stringSchema = stringSchema.regex(
                            /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/,
                        );
                        break;
                }
            }

            return stringSchema;

        case 'number':
        case 'integer':
            let numberSchema = z.number();

            // Adiciona constraints se existirem
            if (
                schema.minimum !== undefined &&
                typeof schema.minimum === 'number'
            ) {
                numberSchema = numberSchema.min(schema.minimum as number);
            }
            if (
                schema.maximum !== undefined &&
                typeof schema.maximum === 'number'
            ) {
                numberSchema = numberSchema.max(schema.maximum as number);
            }
            if (schema.multipleOf && typeof schema.multipleOf === 'number') {
                numberSchema = numberSchema.refine(
                    (val) => val % (schema.multipleOf as number) === 0,
                    { message: `Must be multiple of ${schema.multipleOf}` },
                );
            }

            return numberSchema;

        case 'boolean':
            return z.boolean();

        case 'array':
            if (schema.items) {
                const itemSchema = jsonSchemaToZod(schema.items);
                let arraySchema = z.array(itemSchema);

                // Adiciona constraints de array
                if (schema.minItems && typeof schema.minItems === 'number') {
                    arraySchema = arraySchema.min(schema.minItems as number);
                }
                if (schema.maxItems && typeof schema.maxItems === 'number') {
                    arraySchema = arraySchema.max(schema.maxItems as number);
                }
                if (schema.uniqueItems === true) {
                    arraySchema = arraySchema.refine(
                        (arr) => new Set(arr).size === arr.length,
                        { message: 'Array items must be unique' },
                    );
                }

                return arraySchema;
            }
            return z.array(z.unknown()); // ✅ Zod v4: Mais type-safe que z.any()

        case 'object':
            if (schema.properties) {
                return jsonSchemaToZod(schema);
            }
            return z.record(z.string(), z.unknown()); // ✅ Zod v4: Mais type-safe que z.any()

        case 'null':
            return z.null();

        default:
            return z.unknown(); // ✅ Zod v4: Mais type-safe que z.any()
    }
}

/**
 * Converte JSON Schema para Zod com fallback seguro
 */
export function safeJsonSchemaToZod(jsonSchema: unknown): z.ZodSchema {
    try {
        return jsonSchemaToZod(jsonSchema);
    } catch (error) {
        // ✅ IMPROVED: Better fallback with logging
        console.warn(
            'Failed to convert JSON Schema to Zod, using object fallback:',
            {
                error: error instanceof Error ? error.message : String(error),
                schema: jsonSchema,
            },
        );

        // Try to create a basic object schema if possible
        if (jsonSchema && typeof jsonSchema === 'object') {
            const schema = jsonSchema as Record<string, unknown>;
            if (schema.properties && typeof schema.properties === 'object') {
                const properties = schema.properties as Record<string, unknown>;
                const required = (schema.required as string[]) || [];

                const shape: Record<string, z.ZodSchema> = {};
                for (const [key, prop] of Object.entries(properties)) {
                    const propSchema = prop as Record<string, unknown>;

                    // ✅ IMPROVED: Better type detection
                    let zodProp: z.ZodSchema;
                    if (propSchema.type === 'string') {
                        zodProp = z.string();
                    } else if (
                        propSchema.type === 'number' ||
                        propSchema.type === 'integer'
                    ) {
                        zodProp = z.number();
                    } else if (propSchema.type === 'boolean') {
                        zodProp = z.boolean();
                    } else if (propSchema.type === 'array') {
                        zodProp = z.array(z.unknown());
                    } else if (propSchema.type === 'object') {
                        zodProp = z.record(z.string(), z.unknown());
                    } else {
                        zodProp = z.unknown();
                    }

                    // ✅ IMPROVED: Handle required fields properly
                    if (required.includes(key)) {
                        shape[key] = zodProp;
                    } else {
                        shape[key] = zodProp.optional();
                    }
                }

                return z.object(shape);
            }
        }

        return z.unknown(); // ✅ Zod v4: Mais type-safe que z.any()
    }
}

/**
 * Valida se um JSON Schema é válido para conversão
 */
export function isValidJsonSchema(schema: unknown): boolean {
    if (!schema || typeof schema !== 'object') {
        return false;
    }

    const s = schema as Record<string, unknown>;

    // Deve ter pelo menos type ou properties
    return !!(s.type || s.properties);
}

/**
 * Converte Zod schema para JSON Schema (para compatibilidade reversa)
 */
export function zodToJsonSchema(
    _zodSchema: z.ZodSchema,
): Record<string, unknown> {
    // Implementação básica - pode ser expandida
    return {
        type: 'object',
        properties: {},
        additionalProperties: true,
    };
}
