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
 * Convert MCP tool to Kodus Flow engine tool
 */
export function mcpToolToEngineTool(mcpTool: MCPToolRawWithServer): EngineTool {
    // Convert MCP inputSchema (JSON Schema) to Zod schema
    const zodSchema = safeJsonSchemaToZod(mcpTool.inputSchema);

    return {
        name: mcpTool.serverName
            ? `${mcpTool.serverName}.${mcpTool.name}`
            : mcpTool.name,
        description: mcpTool.description || '',
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
 * Convert multiple MCP tools to engine tools
 */
export function mcpToolsToEngineTools(
    mcpTools: MCPToolRawWithServer[],
): EngineTool[] {
    return mcpTools.map(mcpToolToEngineTool);
}

/**
 * Parse tool name to extract server name and tool name
 */
export function parseToolName(fullName: string): {
    serverName?: string;
    toolName: string;
} {
    const parts = fullName.split('.');
    if (parts.length > 1) {
        return {
            serverName: parts[0],
            toolName: parts.slice(1).join('.'),
        };
    }
    return { toolName: fullName };
}
