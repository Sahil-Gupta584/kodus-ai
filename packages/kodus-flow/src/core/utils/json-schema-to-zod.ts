/**
 * @file JSON Schema to Zod Converter
 * @description Utilitário para conversão de JSON Schema para Zod schemas
 */

import { z } from 'zod';

/**
 * Converte JSON Schema para Zod schema
 * Suporta tipos básicos: string, number, boolean, object, array
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

            return numberSchema;

        case 'boolean':
            return z.boolean();

        case 'array':
            if (schema.items) {
                const itemSchema = jsonSchemaToZod(schema.items);
                return z.array(itemSchema);
            }
            return z.array(z.any());

        case 'object':
            if (schema.properties) {
                return jsonSchemaToZod(schema);
            }
            return z.record(z.any());

        case 'null':
            return z.null();

        default:
            return z.any();
    }
}

/**
 * Converte JSON Schema para Zod com fallback seguro
 */
export function safeJsonSchemaToZod(jsonSchema: unknown): z.ZodSchema {
    try {
        return jsonSchemaToZod(jsonSchema);
    } catch {
        return z.any();
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
