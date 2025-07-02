import { TokenChunkingService } from './tokenChunking.service';
import { LLMModelProvider } from '@/core/infrastructure/adapters/services/llmProviders/llmModelProvider.helper';

/**
 * Exemplo de uso do TokenChunkingService no contexto de análise de PRs
 */
export class TokenChunkingUsageExample {
    constructor(private readonly tokenChunkingService: TokenChunkingService) {}

    /**
     * Exemplo: Dividir arquivos de um PR em chunks baseado em tokens
     */
    async chunkPRFilesForAnalysis(
        prFiles: Array<{ name: string; sha: string; codeDiff: string }>,
        model: LLMModelProvider = LLMModelProvider.GEMINI_2_5_PRO,
        usagePercentage: number = 70
    ) {
        console.log('=== Exemplo: Chunking de arquivos PR ===');
        console.log(`Total de arquivos: ${prFiles.length}`);
        console.log(`Modelo: ${model}`);
        console.log(`Porcentagem de uso: ${usagePercentage}%`);

        const result = this.tokenChunkingService.chunkDataByTokens({
            model,
            data: prFiles,
            usagePercentage,
        });

        console.log('\n=== Resultado ===');
        console.log(`Total de chunks criados: ${result.totalChunks}`);
        console.log(`Limite de tokens por chunk: ${result.tokenLimit}`);
        console.log(`Tokens por chunk:`, result.tokensPerChunk);

        // Exemplo de processamento de cada chunk
        for (let i = 0; i < result.chunks.length; i++) {
            const chunk = result.chunks[i];
            const tokens = result.tokensPerChunk[i];

            console.log(`\nChunk ${i + 1}:`);
            console.log(`- Arquivos: ${chunk.length}`);
            console.log(`- Tokens: ${tokens}`);
            console.log(`- Arquivos neste chunk:`, chunk.map(f => f.name));

            // Aqui você faria a análise do chunk
            // await this.analyzeChunkWithLLM(chunk, model);
        }

        return result;
    }

    /**
     * Exemplo: Chunking com diferentes modelos
     */
    async demonstrateModelDifferences(sampleData: any[]) {
        console.log('\n=== Demonstração: Diferentes modelos ===');

        const models = [
            LLMModelProvider.GEMINI_2_5_PRO,     // 60K tokens
            LLMModelProvider.GEMINI_2_0_FLASH,   // 8K tokens
            LLMModelProvider.CLAUDE_3_5_SONNET,  // usa default 64K
            LLMModelProvider.OPENAI_GPT_4O       // usa default 64K
        ];

        for (const model of models) {
            console.log(`\n--- Modelo: ${model} ---`);

            const result = this.tokenChunkingService.chunkDataByTokens({
                model,
                data: sampleData,
                usagePercentage: 60
            });

            console.log(`Limite de tokens: ${result.tokenLimit}`);
            console.log(`Chunks criados: ${result.totalChunks}`);
        }
    }

    /**
     * Exemplo: Edge case - item que excede o limite
     */
    async demonstrateEdgeCases() {
        console.log('\n=== Demonstração: Edge Cases ===');

        // Criar dados onde um item é muito grande
        const problemData = [
            { name: 'small-file.js', content: 'const x = 1;' },
            {
                name: 'huge-file.js',
                content: 'very long content...'.repeat(10000) // Item muito grande
            },
            { name: 'normal-file.js', content: 'function test() { return true; }' }
        ];

        const result = this.tokenChunkingService.chunkDataByTokens({
            model: LLMModelProvider.GEMINI_2_0_FLASH, // Modelo com limite baixo
            data: problemData,
            usagePercentage: 50
        });

        console.log('Edge case resultado:');
        console.log(`Total chunks: ${result.totalChunks}`);
        console.log('Tokens por chunk:', result.tokensPerChunk);
    }
}

/**
 * Exemplo prático de integração no pipeline de code review
 */
export class CodeReviewPipelineIntegration {
    constructor(private readonly tokenChunkingService: TokenChunkingService) {}

    async processLargePR(
        prFiles: Array<{ name: string; sha: string; codeDiff: string }>,
        model: LLMModelProvider,
        analysisFunction: (chunk: any[], chunkIndex: number) => Promise<any>
    ) {
        // 1. Dividir arquivos em chunks
        const chunkingResult = this.tokenChunkingService.chunkDataByTokens({
            model,
            data: prFiles,
            usagePercentage: 70  // Usar 70% da capacidade do modelo
        });

        console.log(`PR dividido em ${chunkingResult.totalChunks} chunks`);

        // 2. Processar cada chunk separadamente
        const allResults = [];

        for (let i = 0; i < chunkingResult.chunks.length; i++) {
            const chunk = chunkingResult.chunks[i];
            const tokens = chunkingResult.tokensPerChunk[i];

            console.log(`Processando chunk ${i + 1}/${chunkingResult.totalChunks} (${tokens} tokens)`);

            try {
                const chunkResult = await analysisFunction(chunk, i);
                allResults.push(chunkResult);
            } catch (error) {
                console.error(`Erro no chunk ${i + 1}:`, error);
                // Continuar com próximo chunk ou implementar retry
            }
        }

        // 3. Combinar resultados de todos os chunks
        return this.combineChunkResults(allResults);
    }

    private combineChunkResults(results: any[]): any {
        // Implementar lógica para combinar resultados de múltiplos chunks
        // Por exemplo: juntar sugestões, mesclar métricas, etc.
        return {
            combinedSuggestions: results.flatMap(r => r.suggestions || []),
            totalProcessedChunks: results.length,
            overallSummary: 'Análise completa de PR grande processada em chunks'
        };
    }
}
