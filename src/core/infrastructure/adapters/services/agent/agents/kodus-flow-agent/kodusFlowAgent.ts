import { Injectable } from '@nestjs/common';
// import { createOrchestration, defineAgent, defineTool } from '@kodus/flow';
import { z } from 'zod';

@Injectable()
export class KodusFlowAgentProvider {
    // Criar orquestração e engine
    // private orchestration = createOrchestration();
    // // private engine = this.orchestration.createEngine({
    // //     tenant: { tenantId: 'meu-app' },
    // // });

    // // Ferramenta de calculadora
    // private calculatorTool = defineTool({
    //     name: 'calculator',
    //     description: 'Perform basic math calculations',
    //     schema: z.object({
    //         operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    //         a: z.number(),
    //         b: z.number(),
    //     }),
    //     execute: async ({ operation, a, b }) => {
    //         switch (operation) {
    //             case 'add':
    //                 return a + b;
    //             case 'subtract':
    //                 return a - b;
    //             case 'multiply':
    //                 return a * b;
    //             case 'divide':
    //                 return b !== 0 ? a / b : 'Error: Division by zero';
    //             default:
    //                 return 'Unknown operation';
    //         }
    //     },
    // });

    // // Agente assistente
    // private assistantAgent = defineAgent({
    //     name: 'AssistantAgent',
    //     description: 'AI assistant that helps with various tasks',
    //     think: async (input: string, context) => {
    //         // Detectar se é uma operação matemática
    //         const mathPattern = /(\d+)\s*([\+\-\*\/])\s*(\d+)/;
    //         const match = input.match(mathPattern);

    //         if (match) {
    //             const [_, aStr, opStr, bStr] = match;
    //             const a = Number(aStr);
    //             const b = Number(bStr);

    //             let operation: 'add' | 'subtract' | 'multiply' | 'divide';
    //             switch (opStr) {
    //                 case '+':
    //                     operation = 'add';
    //                     break;
    //                 case '-':
    //                     operation = 'subtract';
    //                     break;
    //                 case '*':
    //                     operation = 'multiply';
    //                     break;
    //                 case '/':
    //                     operation = 'divide';
    //                     break;
    //                 default:
    //                     operation = 'add';
    //             }

    //             return {
    //                 reasoning: `Detectei uma operação matemática: ${a} ${opStr} ${b}`,
    //                 action: {
    //                     type: 'tool_call',
    //                     toolName: 'calculator',
    //                     input: { operation, a, b },
    //                 },
    //             };
    //         }

    //         // Resposta padrão para outras entradas
    //         return {
    //             reasoning: 'Processando entrada geral do usuário',
    //             action: {
    //                 type: 'final_answer',
    //                 content: `Você disse: "${input}". Como posso ajudar?`,
    //             },
    //         };
    //     },
    // });

    constructor() {
        // Registrar ferramenta e agente
        // this.engine.withTools([this.calculatorTool]); // Corrigido: withTools (plural) com array
        // this.engine.withAgent(this.assistantAgent);
        console.log('🚀 KodusFlowAgentProvider inicializado');
    }

    // Método para processar entrada do usuário
    async processUserInput(input: string): Promise<string> {
        try {
            // Corrigido: usando call em vez de runAgent
            // const result = await this.engine.call('AssistantAgent', input);
            // return result.data as string;
            return null;
        } catch (error) {
            console.error('Erro ao processar input:', error);
            return 'Desculpe, ocorreu um erro ao processar sua solicitação.';
        }
    }
}
