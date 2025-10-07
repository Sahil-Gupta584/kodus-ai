export function buildJsonModeOptions(
    providerId: string,
    jsonMode?: boolean,
): Record<string, unknown> {
    if (!jsonMode) {
        return {};
    }

    // Google Gemini and Vertex use responseMimeType for JSON mode
    if (providerId === 'google_gemini' || providerId === 'google_vertex') {
        return { responseMimeType: 'application/json' };
    }

    // OpenAI-based providers use response_format, which we set via withConfig elsewhere
    return {};
}
