import { describe, it, expect } from 'vitest';
import { createOrchestration } from '../../src/orchestration/sdk-orchestrator';
import { z } from 'zod';

type AgentResult = {
    action?: { type: string; content?: unknown };
    output?: string;
};

describe('Integração Agent + Tool', () => {
    it('deve executar uma tool via action tool_call do agent', async () => {
        const orchestration = createOrchestration();

        orchestration.createTool({
            name: 'eco',
            description: 'Ecoa o input',
            inputSchema: z.object({
                mensagem: z.string().describe('Mensagem'),
            }),
            execute: async (input: { mensagem: string }) => {
                return { resposta: `ECO: ${input.mensagem}` };
            },
        });

        await orchestration.createAgent({
            name: 'agent-eco',
            description: 'Agent que ecoa usando tool',
            think: async (input: string | { resposta: string }, _context) => {
                // Se recebeu resultado de tool, retorna final_answer
                if (typeof input === 'object' && 'resposta' in input) {
                    return {
                        reasoning:
                            'Recebi resultado da tool, retornando resposta final',
                        action: {
                            type: 'final_answer',
                            content: input.resposta,
                        },
                    };
                }

                // Se recebeu string, usa tool
                return {
                    reasoning: 'Vou usar a tool eco para processar a mensagem',
                    action: {
                        type: 'tool_call',
                        content: {
                            toolName: 'eco',
                            input: { mensagem: input as string },
                        },
                    },
                };
            },
        });

        // 1. Chama o agent - ele deve processar automaticamente o ciclo tool_call → tool → final_answer
        const result = await orchestration.callAgent('agent-eco', 'olá mundo');

        // 2. Verifica que o resultado final é o esperado
        expect((result.result as AgentResult).output).toBe('ECO: olá mundo');

        // 3. Verifica que a execução foi bem-sucedida
        expect(result.success).toBe(true);
    });
});
