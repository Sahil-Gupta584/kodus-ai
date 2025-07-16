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
    debugger;
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

    return {
        name: toolName,
        description: mcpTool.description || `MCP Tool: ${mcpTool.name}`,
        schema: zodSchema,
        jsonSchema: mcpTool.inputSchema, // Keep original JSON Schema for LLMs
        execute: async (_args: unknown, _ctx: unknown) => {
            // This will be overridden by the adapter
            throw new Error(
                'Tool execute function not connected to MCP client',
            );
        },
    };
}

/**
 * Convert multiple MCP tools to engine tools with validation
 */
export function mcpToolsToEngineTools(
    mcpTools: MCPToolRawWithServer[],
): EngineTool[] {
    debugger;
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
