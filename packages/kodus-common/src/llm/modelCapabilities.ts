// model-capabilities.ts
export interface ReasoningConfig {
    type: 'level' | 'budget';
    options: string[] | { min: number; max?: number; default: number };
}

export interface ModelCapabilities {
    supportsTemperature: boolean;
    supportsReasoning: boolean;
    reasoningConfig?: ReasoningConfig;
}

// Modelos que NÃO suportam temperature
export const MODELS_WITHOUT_TEMPERATURE = new Set([
    // OpenAI o1 series
    'o1-mini',
    'o1-mini-2024-09-12',
    'o1',
    'o1-2024-12-17',

    // OpenAI o3 series
    'o3-mini',
    'o3-mini-2025-01-31',
    'o3',
    'o3-2025-04-16',

    // OpenAI o4 series
    'o4-mini',
    'o4-mini-2025-04-16',

    // OpenAI o3-pro
    'o3-pro',
    'o3-pro-2025-06-10',

    // Deep research models
    'o4-mini-deep-research',
    'o3-deep-research',
    'o3-deep-research-2025-06-26',
    'o4-mini-deep-research-2025-06-26',
]);

// Modelos que suportam reasoning
export const MODELS_WITH_REASONING = new Map<string, ReasoningConfig>([
    // OpenAI o1 series - reasoning level (low, medium, high)
    ['o1-mini', { type: 'level', options: ['low', 'medium', 'high'] }],
    [
        'o1-mini-2024-09-12',
        { type: 'level', options: ['low', 'medium', 'high'] },
    ],
    ['o1', { type: 'level', options: ['low', 'medium', 'high'] }],
    ['o1-2024-12-17', { type: 'level', options: ['low', 'medium', 'high'] }],

    // OpenAI o3 series - reasoning level (low, medium, high)
    ['o3-mini', { type: 'level', options: ['low', 'medium', 'high'] }],
    [
        'o3-mini-2025-01-31',
        { type: 'level', options: ['low', 'medium', 'high'] },
    ],
    ['o3', { type: 'level', options: ['low', 'medium', 'high'] }],
    ['o3-2025-04-16', { type: 'level', options: ['low', 'medium', 'high'] }],

    // OpenAI o4 series - reasoning level (low, medium, high)
    ['o4-mini', { type: 'level', options: ['low', 'medium', 'high'] }],
    [
        'o4-mini-2025-04-16',
        { type: 'level', options: ['low', 'medium', 'high'] },
    ],

    // OpenAI o3-pro - reasoning level (low, medium, high)
    ['o3-pro', { type: 'level', options: ['low', 'medium', 'high'] }],
    [
        'o3-pro-2025-06-10',
        { type: 'level', options: ['low', 'medium', 'high'] },
    ],

    // OpenAI deep research models - reasoning level (low, medium, high)
    [
        'o4-mini-deep-research',
        { type: 'level', options: ['low', 'medium', 'high'] },
    ],
    ['o3-deep-research', { type: 'level', options: ['low', 'medium', 'high'] }],
    [
        'o3-deep-research-2025-06-26',
        { type: 'level', options: ['low', 'medium', 'high'] },
    ],
    [
        'o4-mini-deep-research-2025-06-26',
        { type: 'level', options: ['low', 'medium', 'high'] },
    ],

    // Google Gemini 2.0 thinking models - thinking budget (numeric)
    [
        'gemini-2.0-flash-thinking-exp',
        {
            type: 'budget',
            options: { min: 128, default: 10000 },
        },
    ],

    // Google Gemini 2.5 thinking models - thinking budget (numeric)
    [
        'gemini-2.5-pro',
        {
            type: 'budget',
            options: { min: 128, default: 10000 },
        },
    ],
    [
        'gemini-2.5-flash',
        {
            type: 'budget',
            options: { min: 128, default: 10000 },
        },
    ],
    [
        'gemini-2.5-flash-lite',
        {
            type: 'budget',
            options: { min: 128, default: 10000 },
        },
    ],
]);

export function supportsTemperature(model: string): boolean {
    return !MODELS_WITHOUT_TEMPERATURE.has(model);
}

export function getModelCapabilities(model: string): ModelCapabilities {
    const reasoningConfig = MODELS_WITH_REASONING.get(model);

    return {
        supportsTemperature: supportsTemperature(model),
        supportsReasoning: !!reasoningConfig,
        reasoningConfig,
    };
}
