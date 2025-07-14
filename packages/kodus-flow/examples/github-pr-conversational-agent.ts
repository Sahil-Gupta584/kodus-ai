/**
 * Exemplo Prático: Agent Conversacional para GitHub PR
 *
 * Este exemplo mostra como usar o SDK Kodus Flow para criar um agent
 * que conversa sobre um Pull Request específico do GitHub.
 *
 * FEATURES:
 * ✅ Agent com identidade estruturada
 * ✅ Tools para buscar informações do PR
 * ✅ Conversação natural sobre código
 * ✅ Context aware (mantém contexto da conversa)
 */

import { SDKOrchestrator } from '../src/orchestration/sdk-orchestrator.js';
import { createMockLLMAdapter } from '../src/adapters/llm/mock-provider.js';
import { z } from 'zod';

// =====================================================
// 🔧 CONFIGURAÇÃO INICIAL
// =====================================================

interface GitHubPRData {
    number: number;
    title: string;
    description: string;
    author: string;
    files: Array<{
        filename: string;
        status: 'added' | 'modified' | 'deleted';
        changes: number;
        patch?: string;
    }>;
    commits: Array<{
        sha: string;
        message: string;
        author: string;
        date: string;
    }>;
    comments: Array<{
        id: number;
        author: string;
        body: string;
        created_at: string;
    }>;
}

// Mock data - você substituiria por dados reais da API GitHub
const mockPRData: GitHubPRData = {
    number: 123,
    title: 'feat: add infinite loop protection to agent execution',
    description:
        'This PR adds protection against infinite loops in agent execution by limiting event count and rate.',
    author: 'wellingtonsantana',
    files: [
        {
            filename: 'src/engine/agents/agent-core.ts',
            status: 'modified',
            changes: 45,
            patch: '@@ -100,6 +100,15 @@ export class AgentCore {\n+    // Add loop protection\n+    private checkForInfiniteLoop() {\n+        // Implementation\n+    }',
        },
        {
            filename: 'src/core/types/agent-types.ts',
            status: 'modified',
            changes: 12,
        },
    ],
    commits: [
        {
            sha: 'abc123',
            message: 'feat: implement loop protection',
            author: 'wellingtonsantana',
            date: '2024-01-15T10:30:00Z',
        },
    ],
    comments: [
        {
            id: 1,
            author: 'reviewer1',
            body: 'Looks good! Can you add tests for the edge cases?',
            created_at: '2024-01-15T11:00:00Z',
        },
    ],
};

// =====================================================
// 🛠️ TOOLS PARA O AGENT
// =====================================================

const prAnalysisTools = [
    {
        name: 'get-pr-overview',
        description:
            'Get general information about the PR (title, description, author, files changed)',
        inputSchema: z.object({}),
        async execute() {
            return {
                number: mockPRData.number,
                title: mockPRData.title,
                description: mockPRData.description,
                author: mockPRData.author,
                filesCount: mockPRData.files.length,
                files: mockPRData.files.map((f) => ({
                    filename: f.filename,
                    status: f.status,
                    changes: f.changes,
                })),
            };
        },
    },
    {
        name: 'get-file-details',
        description: 'Get detailed information about a specific file in the PR',
        inputSchema: z.object({
            filename: z.string().describe('The filename to get details for'),
        }),
        async execute(input: { filename: string }) {
            const file = mockPRData.files.find((f) =>
                f.filename.includes(input.filename),
            );
            if (!file) {
                return { error: `File ${input.filename} not found in this PR` };
            }
            return {
                filename: file.filename,
                status: file.status,
                changes: file.changes,
                patch: file.patch || 'Patch details not available',
            };
        },
    },
    {
        name: 'get-commits',
        description: 'Get list of commits in this PR',
        inputSchema: z.object({}),
        async execute() {
            return {
                commits: mockPRData.commits,
            };
        },
    },
    {
        name: 'get-pr-comments',
        description: 'Get comments and reviews on this PR',
        inputSchema: z.object({}),
        async execute() {
            return {
                comments: mockPRData.comments,
            };
        },
    },
    {
        name: 'analyze-code-impact',
        description: 'Analyze the impact and complexity of changes in the PR',
        inputSchema: z.object({
            focus: z
                .string()
                .optional()
                .describe(
                    'Specific aspect to focus on (security, performance, etc)',
                ),
        }),
        async execute(input: { focus?: string }) {
            const totalChanges = mockPRData.files.reduce(
                (sum, file) => sum + file.changes,
                0,
            );
            const modifiedFiles = mockPRData.files.filter(
                (f) => f.status === 'modified',
            ).length;
            const addedFiles = mockPRData.files.filter(
                (f) => f.status === 'added',
            ).length;

            return {
                summary: `PR contains ${totalChanges} total changes across ${mockPRData.files.length} files`,
                impact:
                    totalChanges > 100
                        ? 'high'
                        : totalChanges > 50
                          ? 'medium'
                          : 'low',
                breakdown: {
                    modified: modifiedFiles,
                    added: addedFiles,
                    totalLines: totalChanges,
                },
                focus: input.focus
                    ? `Focusing on ${input.focus} aspects`
                    : 'General analysis',
            };
        },
    },
];

// =====================================================
// 🤖 CRIAÇÃO DO AGENT
// =====================================================

async function createGitHubPRAgent() {
    // 1. Configurar LLM (você usaria seu LLM real aqui)
    const llmAdapter = createMockLLMAdapter({
        modelName: 'gpt-4',
        temperature: 0.7,
        systemPromptPrefix: 'You are a helpful GitHub PR assistant.',
    });

    // 2. Inicializar SDK
    const orchestrator = new SDKOrchestrator({
        llmAdapter,
        tenantId: 'github-integration',
        enableObservability: true,
        defaultPlanner: 'llmReact', // Usar ReAct para análise estruturada
        defaultMaxIterations: 10,
    });

    // 3. Registrar tools
    for (const tool of prAnalysisTools) {
        await orchestrator.createTool(tool);
    }

    // 4. Criar agent com identidade estruturada
    const prAgent = await orchestrator.createAgent({
        name: 'github-pr-assistant',
        identity: {
            role: 'GitHub Pull Request Assistant',
            goal: 'Help users understand and analyze GitHub Pull Requests through natural conversation',
            expertise: ['Git', 'Code Review', 'GitHub', 'Software Development'],
            personality:
                'You are knowledgeable about software development and code review best practices. You provide clear, helpful analysis of code changes and can answer questions about PR details.',
            style: 'professional but approachable',
        },
        planner: 'llmReact',
        maxIterations: 8,
    });

    console.log('🎉 GitHub PR Agent criado com sucesso!');
    return { orchestrator, prAgent };
}

// =====================================================
// 💬 SIMULAÇÃO DE CONVERSAÇÃO
// =====================================================

async function simulateConversation() {
    const { orchestrator, prAgent } = await createGitHubPRAgent();

    const questions = [
        'Olá! Me fale sobre este PR, o que ele faz?',
        'Quais arquivos foram modificados?',
        'Pode me mostrar os detalhes do arquivo agent-core.ts?',
        'Esse PR tem algum impacto significativo na segurança?',
        'O que os reviewers estão comentando?',
        'Você recomendaria aprovar este PR?',
    ];

    console.log('\n🗣️  Iniciando conversa com o GitHub PR Assistant...\n');
    console.log(
        `📋 Analisando PR #${mockPRData.number}: "${mockPRData.title}"\n`,
    );

    for (const question of questions) {
        console.log(`👤 Usuário: ${question}`);

        try {
            const result = await orchestrator.runAgent(prAgent.name, question, {
                sessionId: 'github-pr-session',
                timeout: 30000,
            });

            if (result.success) {
                console.log(`🤖 Assistant: ${result.result}\n`);
            } else {
                console.log(`❌ Erro: ${result.error}\n`);
            }
        } catch (error) {
            console.log(`💥 Erro na execução: ${error}\n`);
        }

        // Pausa entre perguntas para simular conversa real
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
}

// =====================================================
// 🚀 EXEMPLO DE USO AVANÇADO
// =====================================================

async function advancedUsageExample() {
    const { orchestrator, prAgent } = await createGitHubPRAgent();

    console.log('\n🔧 Exemplo de uso avançado...\n');

    // Contexto personalizado para o agent
    const result = await orchestrator.runAgent(
        prAgent.name,
        'Analise este PR focando em possíveis problemas de performance e segurança',
        {
            sessionId: 'security-review-session',
            timeout: 45000,
            user: {
                metadata: {
                    role: 'security-reviewer',
                    team: 'platform-security',
                },
            },
            system: {
                debugInfo: {
                    reviewType: 'security-focused',
                    priority: 'high',
                },
            },
        },
    );

    console.log('🔍 Análise de Segurança:', result);
}

// =====================================================
// 🎯 EXECUÇÃO PRINCIPAL
// =====================================================

async function main() {
    try {
        console.log('🚀 Demonstração do SDK Kodus Flow - GitHub PR Agent\n');

        await simulateConversation();
        await advancedUsageExample();

        console.log('\n✅ Demonstração concluída com sucesso!');
        console.log('\n📝 Próximos passos:');
        console.log(
            '   1. Substituir mockPRData por dados reais da API GitHub',
        );
        console.log('   2. Adicionar seu LLM adapter real');
        console.log('   3. Implementar tools para comentar no PR');
        console.log('   4. Adicionar persistência de conversação');
    } catch (error) {
        console.error('❌ Erro na demonstração:', error);
    }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { createGitHubPRAgent, simulateConversation, advancedUsageExample };
