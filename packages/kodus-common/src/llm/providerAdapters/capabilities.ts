// model-capabilities.ts (runtime metadata + helpers)
import type { ModelCapabilities, ReasoningConfig } from './modelTypes';

// Default numeric reasoning budget when not specified explicitly
export const DEFAULT_REASONING_BUDGET = 3000;
// Default qualitative reasoning level when not specified explicitly
export const DEFAULT_REASONING_LEVEL: 'low' | 'medium' | 'high' = 'low';

function budget(
    defaultBudget: number = DEFAULT_REASONING_BUDGET,
    min: number = 128,
): ReasoningConfig {
    return { type: 'budget', options: { min, default: defaultBudget } };
}

function level(
    options: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'],
): ReasoningConfig {
    // Keep 'low' first to imply default ordering preference
    return { type: 'level', options } as ReasoningConfig;
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

// Pattern rules (fallbacks) for capabilities by model family
const WITHOUT_TEMPERATURE_PATTERNS: RegExp[] = [
    /^o1(\b|[-_@])/, // all o1*
    /^o3(\b|[-_@])/, // all o3*
    /^o4(\b|[-_@])/, // all o4*
];

// Modelos que suportam reasoning
export const MODELS_WITH_REASONING = new Map<string, ReasoningConfig>([
    // OpenAI o1 series - reasoning level (low, medium, high)
    ['o1-mini', level()],
    ['o1-mini-2024-09-12', level()],
    ['o1', level()],
    ['o1-2024-12-17', level()],

    // OpenAI o3 series - reasoning level (low, medium, high)
    ['o3-mini', level()],
    ['o3-mini-2025-01-31', level()],
    ['o3', level()],
    ['o3-2025-04-16', level()],

    // OpenAI o4 series - reasoning level (low, medium, high)
    ['o4-mini', level()],
    ['o4-mini-2025-04-16', level()],

    // OpenAI o3-pro - reasoning level (low, medium, high)
    ['o3-pro', level()],
    ['o3-pro-2025-06-10', level()],

    // OpenAI deep research models - reasoning level (low, medium, high)
    ['o4-mini-deep-research', level()],
    ['o3-deep-research', level()],
    ['o3-deep-research-2025-06-26', level()],
    ['o4-mini-deep-research-2025-06-26', level()],

    // Google Gemini 2.0 thinking models - thinking budget (numeric)
    ['gemini-2.0-flash-thinking-exp', budget()],

    // Google Gemini 2.5 thinking models - thinking budget (numeric)
    ['gemini-2.5-pro', budget()],
    ['gemini-2.5-flash', budget()],
    ['gemini-2.5-flash-lite', budget()],

    // Anthropic Claude models - reasoning budget (numeric)
    ['claude-opus-4-1-20250805', budget()],
    ['claude-opus-4-20250514', budget()],
    ['claude-sonnet-4-5-20250929', budget()],
    ['claude-sonnet-4-20250514', budget()],
    ['claude-3-7-sonnet-20250219', budget()],
]);

const REASONING_PATTERN_RULES: Array<[RegExp, ReasoningConfig]> = [
    // OpenAI families (level)
    [/^o1(\b|[-_@])/, level()],
    [/^o3(\b|[-_@])/, level()],
    [/^o4(\b|[-_@])/, level()],
    [/deep-research/i, level()],

    // Gemini 2.5 (budget)
    [/^gemini-2\.5-pro(\b|[-_@])/, budget()],
    [/^gemini-2\.5-flash(\b|[-_@])/, budget()],
    [/^gemini-2\.5-flash-lite(\b|[-_@])/, budget()],
    // Gemini 2.0 thinking experimental
    [/^gemini-2\.0-.*thinking.*/i, budget()],

    // Anthropic Claude - budget for recent families
    [/^claude-opus-4(\b|[-_@])/, budget()],
    [/^claude-sonnet-4(\b|[-_@])/, budget()],
    [/^claude-3-7-sonnet(\b|[-_@])/, budget()],
];

// Default max tokens by model (when provider allows setting output tokens)
export const DEFAULT_MAX_TOKENS_BY_MODEL = new Map<string, number>([
    // Google Gemini 2.5
    ['gemini-2.5-pro', 60000],
    ['gemini-2.5-flash', 60000],
    ['gemini-2.5-flash-lite', 30000],

    // Google Gemini 2.0
    ['gemini-2.0-flash', 8000],

    // Anthropic Claude 4.x
    ['claude-opus-4-1-20250805', 15000],
    ['claude-opus-4-20250514', 15000],
    ['claude-sonnet-4-5-20250929', 15000],
    ['claude-sonnet-4-20250514', 15000],
    ['claude-3-7-sonnet-20250219', 15000],

    // Anthropic Claude 3.x
    ['claude-3-5-sonnet-20241022', 8192],
    ['claude-3-5-haiku-20241022', 8192],
    ['claude-3-5-sonnet-20240620', 8192],
    ['claude-3-haiku-20240307', 4096],
    ['claude-3-opus-20240229', 4096],
]);

const DEFAULT_MAX_TOKENS_PATTERN_RULES: Array<[RegExp, number]> = [
    // Gemini
    [/^gemini-2\.5-pro(\b|[-_@])/, 60000],
    [/^gemini-2\.5-flash(\b|[-_@])/, 60000],
    [/^gemini-2\.5-flash-lite(\b|[-_@])/, 30000],
    [/^gemini-2\.0-flash(\b|[-_@])/, 8000],

    // Anthropic Claude 4.x
    [/^claude-opus-4(\b|[-_@])/, 15000],
    [/^claude-sonnet-4(\b|[-_@])/, 15000],
    [/^claude-3-7-sonnet(\b|[-_@])/, 15000],

    // Anthropic Claude 3.x
    [/^claude-3-5-sonnet(\b|[-_@])/, 8192],
    [/^claude-3-5-haiku(\b|[-_@])/, 8192],
    [/^claude-3-haiku(\b|[-_@])/, 4096],
    [/^claude-3-opus(\b|[-_@])/, 4096],
];

function findByPattern<T>(
    model: string,
    patterns: Array<[RegExp, T]>,
): T | undefined {
    for (const [re, val] of patterns) {
        if (re.test(model)) return val;
    }
    return undefined;
}

export function supportsTemperature(model: string): boolean {
    if (MODELS_WITHOUT_TEMPERATURE.has(model)) return false;
    // fallback to patterns
    for (const re of WITHOUT_TEMPERATURE_PATTERNS) {
        if (re.test(model)) return false;
    }
    return true;
}

export function getModelCapabilities(model: string): ModelCapabilities {
    const reasoningConfig =
        MODELS_WITH_REASONING.get(model) ??
        findByPattern(model, REASONING_PATTERN_RULES);
    const defaultMaxTokens =
        DEFAULT_MAX_TOKENS_BY_MODEL.get(model) ??
        findByPattern(model, DEFAULT_MAX_TOKENS_PATTERN_RULES);

    return {
        supportsTemperature: supportsTemperature(model),
        supportsReasoning: !!reasoningConfig,
        reasoningConfig,
        defaultMaxTokens,
    };
}

export function supportsReasoning(model: string): boolean {
    return !!getModelCapabilities(model).reasoningConfig;
}

export function getReasoningType(
    model: string,
): 'level' | 'budget' | undefined {
    return getModelCapabilities(model).reasoningConfig?.type;
}

export function supportsBudgetReasoning(model: string): boolean {
    return getReasoningType(model) === 'budget';
}
