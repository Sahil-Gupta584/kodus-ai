import { MODEL_STRATEGIES, LLMModelProvider } from "@/core/infrastructure/adapters/services/llmProviders/llmModelProvider.helper";



const {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
} = require('@google/generative-ai');

export const getGemini = async (params?: {
    model?: string;
    temperature?: number;
    responseMimeType?: string;
}) => {
    const genAI = new GoogleGenerativeAI(process.env.API_GOOGLE_AI_API_KEY);

    const llm = genAI.getGenerativeModel({
        model: params.model || MODEL_STRATEGIES[LLMModelProvider.GEMINI_2_5_PRO_PREVIEW_05_06].modelName,
    });

    return llm.startChat({
        generationConfig: {
            temperature: params.temperature || 0,
            responseMimeType: params.responseMimeType || 'text/plain',
        },
        history: [],
    });
};
