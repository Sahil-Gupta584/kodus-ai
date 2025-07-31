import type { ToolMetadataForLLM } from '../../core/types/tool-types.js';

export const BUILT_IN_TOOLS: ToolMetadataForLLM[] = [
    // ✅ REMOVED: conversation tool - responses now handled by Response Synthesizer
];

/**
 * Get all built-in tools metadata
 */
export function getBuiltInTools(): ToolMetadataForLLM[] {
    return BUILT_IN_TOOLS;
}

/**
 * Check if a tool name is a built-in tool
 */
export function isBuiltInTool(toolName: string): boolean {
    return BUILT_IN_TOOLS.some((tool) => tool.name === toolName);
}

/**
 * Get metadata for a specific built-in tool
 */
export function getBuiltInTool(
    toolName: string,
): ToolMetadataForLLM | undefined {
    return BUILT_IN_TOOLS.find((tool) => tool.name === toolName);
}

/**
 * Execute a built-in tool
 * Returns the formatted response content
 * ✅ REMOVED: No built-in tools available - all responses handled by Response Synthesizer
 */
export function executeBuiltInTool(toolName: string): {
    success: false;
    error: string;
} {
    return {
        success: false,
        error: JSON.stringify({
            type: 'no_built_in_tools',
            toolName,
            message:
                'No built-in tools available - responses handled by Response Synthesizer',
        }),
    };
}
