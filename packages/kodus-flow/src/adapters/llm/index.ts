/**
 * LLM Adapter - Stub para integração externa
 *
 * O SDK não implementa LLMs próprios. O provider de LLM deve ser fornecido
 * externamente pelo projeto principal que usa o SDK.
 */

// =============================================================================
// TIPOS E INTERFACES BÁSICAS
// =============================================================================

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    name?: string;
    toolCallId?: string;
    toolCalls?: Array<{
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }>;
}

export interface LLMRequest {
    messages: LLMMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }>;
}

export interface LLMResponse {
    content: string;
    toolCalls?: Array<{
        name: string;
        arguments: Record<string, unknown>;
    }>;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface LLMConfig {
    provider: string;
    apiKey?: string;
    model?: string;
    baseURL?: string;
    timeout?: number;
    maxRetries?: number;
}

// =============================================================================
// INTERFACE PRINCIPAL
// =============================================================================

export interface LLMAdapter {
    call(request: LLMRequest): Promise<LLMResponse>;
    analyzeContext(
        pergunta: string,
        availableTools: Array<{ name: string; description?: string }>,
    ): Promise<{
        intent: string;
        urgency: 'low' | 'normal' | 'high';
        complexity: 'simple' | 'medium' | 'complex';
        selectedTool: string;
        confidence: number;
        reasoning: string;
    }>;
    extractParameters(
        pergunta: string,
        toolName: string,
        context: unknown,
    ): Promise<Record<string, unknown>>;
    generateResponse(
        result: unknown,
        originalQuestion: string,
    ): Promise<string>;

    // ✅ NEW: Structured generation support
    supportsStructuredGeneration?(): boolean;

    // ✅ NEW: Legacy planning methods (for backward compatibility)
    createPlan?(
        goal: string,
        strategy: string,
        context: unknown,
    ): Promise<unknown>;

    getProvider?(): { name: string };
    getAvailableTechniques?(): string[];
}

// =============================================================================
// FACTORY STUB
// =============================================================================

export function createLLMAdapter(_config: LLMConfig): LLMAdapter {
    throw new Error(
        'LLM Adapter não implementado no SDK. O provider de LLM deve ser fornecido externamente pelo projeto principal.',
    );
}

export function createDefaultLLMAdapter(): LLMAdapter | null {
    return null;
}

// Mock provider para testes
export { createMockLLMProvider } from './mock-provider.js';
