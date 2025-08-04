import type { MCPToolRawWithServer } from './types.js';
import { z } from 'zod';
import { safeJsonSchemaToZod } from '../../core/utils/json-schema-to-zod.js';

/**
 * Tool structure expected by the engine
 */
export interface EngineTool {
    name: string;
    description: string;
    schema: z.ZodSchema;
    jsonSchema: unknown; // Original JSON Schema from MCP
    execute: (args: unknown, ctx: unknown) => Promise<unknown>;
}

/**
 * Validate MCP tool schema
 */
export function validateMCPSchema(schema: unknown): boolean {
    if (!schema || typeof schema !== 'object') {
        return false;
    }

    const s = schema as Record<string, unknown>;

    // Must have type or properties
    if (!s.type && !s.properties) {
        return false;
    }

    // If has type, must be valid
    if (s.type && typeof s.type !== 'string') {
        return false;
    }

    // If has properties, must be object
    if (s.properties && typeof s.properties !== 'object') {
        return false;
    }

    return true;
}

/**
 * Convert MCP tool to Kodus Flow engine tool with validation
 */
export function mcpToolToEngineTool(mcpTool: MCPToolRawWithServer): EngineTool {
    // Validate MCP schema
    if (!validateMCPSchema(mcpTool.inputSchema)) {
        console.warn(
            `Invalid MCP schema for tool ${mcpTool.name}, using fallback`,
        );
    }

    // Convert MCP inputSchema (JSON Schema) to Zod schema
    const zodSchema = safeJsonSchemaToZod(mcpTool.inputSchema);

    // Validate tool name format
    const toolName = mcpTool.serverName
        ? `${mcpTool.serverName}.${mcpTool.name}`
        : mcpTool.name;

    if (!toolName || toolName.includes('..')) {
        throw new Error(`Invalid tool name: ${toolName}`);
    }

    // ✅ IMPROVED: Preserve original JSON Schema with enhanced metadata
    const enhancedJsonSchema = enhanceMCPSchema(mcpTool.inputSchema);

    return {
        name: toolName,
        description: mcpTool.description || `MCP Tool: ${mcpTool.name}`,
        schema: zodSchema,
        jsonSchema: enhancedJsonSchema, // Enhanced JSON Schema for LLMs
        execute: async (_args: unknown, _ctx: unknown) => {
            // This will be overridden by the adapter
            throw new Error(
                'Tool execute function not connected to MCP client',
            );
        },
    };
}

/**
 * Enhance MCP JSON Schema to preserve important metadata
 */
function enhanceMCPSchema(schema: unknown): unknown {
    if (!schema || typeof schema !== 'object') {
        return schema;
    }

    const enhancedSchema = { ...schema } as Record<string, unknown>;

    // Ensure required array is preserved
    if (
        enhancedSchema.properties &&
        typeof enhancedSchema.properties === 'object'
    ) {
        const properties = enhancedSchema.properties as Record<string, unknown>;

        // If no required array exists, try to infer from properties
        if (
            !enhancedSchema.required ||
            !Array.isArray(enhancedSchema.required)
        ) {
            const inferredRequired: string[] = [];

            for (const [key, prop] of Object.entries(properties)) {
                const propObj = prop as Record<string, unknown>;

                // Only mark as required if explicitly marked as required: true
                if (propObj.required === true) {
                    inferredRequired.push(key);
                }

                // Don't infer required from complex objects - let the original schema decide
                // This prevents marking optional fields as required
            }

            if (inferredRequired.length > 0) {
                enhancedSchema.required = inferredRequired;
            }
        }

        // Enhance individual properties
        for (const [key, prop] of Object.entries(properties)) {
            const propObj = prop as Record<string, unknown>;
            const enhancedProp = { ...propObj };

            // Preserve format information
            if (propObj.format && typeof propObj.format === 'string') {
                enhancedProp.format = propObj.format;
            }

            // Preserve enum information
            if (propObj.enum && Array.isArray(propObj.enum)) {
                enhancedProp.enum = propObj.enum;
            }

            // Preserve description
            if (
                propObj.description &&
                typeof propObj.description === 'string'
            ) {
                enhancedProp.description = propObj.description;
            }

            // Handle nested objects
            if (propObj.type === 'object' && propObj.properties) {
                enhancedProp.properties = enhanceMCPSchema(propObj.properties);
            }

            // Handle arrays
            if (propObj.type === 'array' && propObj.items) {
                enhancedProp.items = enhanceMCPSchema(propObj.items);
            }

            properties[key] = enhancedProp;
        }
    }

    return enhancedSchema;
}

/**
 * Convert multiple MCP tools to engine tools with validation
 */
export function mcpToolsToEngineTools(
    mcpTools: MCPToolRawWithServer[],
): EngineTool[] {
    const validTools: EngineTool[] = [];
    const invalidTools: string[] = [];

    for (const mcpTool of mcpTools) {
        try {
            const engineTool = mcpToolToEngineTool(mcpTool);
            validTools.push(engineTool);
        } catch (error) {
            invalidTools.push(mcpTool.name);
            console.warn(`Failed to convert MCP tool ${mcpTool.name}:`, error);
        }
    }

    if (invalidTools.length > 0) {
        console.warn(
            `Skipped ${invalidTools.length} invalid MCP tools:`,
            invalidTools,
        );
    }

    return validTools;
}

/**
 * Parse tool name to extract server name and tool name
 */
export function parseToolName(fullName: string): {
    serverName?: string;
    toolName: string;
} {
    if (!fullName || typeof fullName !== 'string') {
        throw new Error('Invalid tool name');
    }

    const parts = fullName.split('.');
    if (parts.length > 1) {
        return {
            serverName: parts[0],
            toolName: parts.slice(1).join('.'),
        };
    }
    return { toolName: fullName };
}

/**
 * Validate MCP tool configuration
 */
export function validateMCPToolConfig(tool: MCPToolRawWithServer): boolean {
    // Check required fields
    if (!tool.name || typeof tool.name !== 'string') {
        return false;
    }

    // Check name format
    if (
        tool.name.includes('..') ||
        tool.name.startsWith('.') ||
        tool.name.endsWith('.')
    ) {
        return false;
    }

    // Check server name if provided
    if (tool.serverName && typeof tool.serverName !== 'string') {
        return false;
    }

    // Check schema
    if (!validateMCPSchema(tool.inputSchema)) {
        return false;
    }

    return true;
}
