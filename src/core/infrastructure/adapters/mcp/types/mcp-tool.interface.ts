import { z } from 'zod';

export interface McpToolDefinition<T = any> {
    name: string;
    description: string;
    inputSchema: z.ZodSchema<T>;
    outputSchema: z.ZodSchema<T>;
    handler: ((args: T, extra?: any) => Promise<any>) | null;
}

export interface McpToolDefinitionTemplate<T = any> {
    name: string;
    description: string;
    inputSchema: z.ZodSchema<T>;
}

export interface McpToolResult {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    _meta?: { [x: string]: unknown };
}

export interface McpToolRegistry {
    getTools(): McpToolDefinition[];
    registerTool(tool: McpToolDefinition): void;
}

// Helper type para extrair o schema de um ZodSchema
export type InferSchemaType<T> = T extends z.ZodSchema<infer U> ? U : never;