export interface ModelCapabilities {
    supportsTemperature: boolean;
}

// Apenas modelos que NÃO suportam temperature
export const MODELS_WITHOUT_TEMPERATURE = new Set([
    'o1-mini',
    'o1-mini-2024-09-12',
    'o1',
    'o1-2024-12-17',
    'o3-mini',
    'o3-mini-2025-01-31',
    'o3',
    'o3-2025-04-16',
    'o4-mini',
    'o4-mini-2025-04-16',
    'o3-pro',
    'o3-pro-2025-06-10',
    'o4-mini-deep-research',
    'o3-deep-research',
    'o3-deep-research-2025-06-26',
    'o4-mini-deep-research-2025-06-26',
]);

export function supportsTemperature(model: string): boolean {
    return !MODELS_WITHOUT_TEMPERATURE.has(model);
}
