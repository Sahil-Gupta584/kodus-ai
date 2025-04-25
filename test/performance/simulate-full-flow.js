/**
 * Simulação completa do fluxo de webhooks, incluindo processamento, banco de dados e LLMs
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// Configurações
const CONFIG = {
    // Configurações da aplicação
    app: {
        baseUrl: 'http://localhost:3000',
        timeout: 180000, // 3 minutos
    },
    // Configurações de teste
    test: {
        // Número de webhooks a serem enviados por plataforma
        webhooksPerPlatform: 5,
        // Intervalo entre os webhooks em ms
        interval: 2000,
        // Tempo máximo de espera para conclusão em ms
        timeout: 300000, // 5 minutos
        // Caminho para o arquivo de webhooks
        webhooksPath: path.join(__dirname, 'data/webhooks-expanded.json'),
        // Se deve verificar o MongoDB para confirmar processamento
        verifyMongoDB: true,
        // Se deve simular chamadas LLM
        simulateLLM: true,
    },
    // Configurações do MongoDB
    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
        dbName: 'kodus-ai',
        collections: {
            pullRequests: 'pullrequests',
            automationExecutions: 'automationexecutions',
        },
    },
    // Configurações do mock de LLM
    llmMock: {
        // Endpoint do serviço de mock (se estiver usando)
        endpoint: 'http://localhost:8080/mock-llm',
        // Tempo médio de resposta simulado (ms)
        avgResponseTime: 2000,
        // Variação do tempo de resposta (ms)
        responseTimeVariation: 1000,
    },
};

// Classe para simular o fluxo completo
class FullFlowSimulator {
    constructor() {
        this.webhooks = [];
        this.results = [];
        this.startTime = 0;
        this.mongoClient = null;
        this.db = null;
    }

    // Inicializa o simulador
    async initialize() {
        console.log('Inicializando simulador de fluxo completo...');

        // Carrega os webhooks
        this.webhooks = await this.loadWebhooks();

        // Conecta ao MongoDB se necessário
        if (CONFIG.test.verifyMongoDB) {
            await this.connectToMongoDB();
        }

        console.log(`Carregados ${this.webhooks.length} webhooks para teste`);
        return this;
    }

    // Carrega os webhooks do arquivo
    async loadWebhooks() {
        try {
            if (fs.existsSync(CONFIG.test.webhooksPath)) {
                const webhooksContent = fs.readFileSync(
                    CONFIG.test.webhooksPath,
                    'utf8',
                );
                const allWebhooks = JSON.parse(webhooksContent);

                // Expande os webhooks conforme a configuração
                const expandedWebhooks = [];

                // Agrupa webhooks por plataforma
                const webhooksByPlatform = {};
                allWebhooks.forEach((webhook) => {
                    const platform = webhook.platform || 'github';
                    if (!webhooksByPlatform[platform]) {
                        webhooksByPlatform[platform] = [];
                    }
                    webhooksByPlatform[platform].push(webhook);
                });

                // Para cada plataforma, seleciona o número configurado de webhooks
                Object.entries(webhooksByPlatform).forEach(
                    ([platform, platformWebhooks]) => {
                        for (
                            let i = 0;
                            i < CONFIG.test.webhooksPerPlatform;
                            i++
                        ) {
                            // Seleciona um webhook aleatório da plataforma
                            const baseWebhook =
                                platformWebhooks[i % platformWebhooks.length];

                            // Cria uma cópia com algumas modificações para torná-lo único
                            const uniqueWebhook = JSON.parse(
                                JSON.stringify(baseWebhook),
                            );

                            // Modifica alguns campos para tornar o webhook único
                            if (uniqueWebhook.payload.pull_request) {
                                uniqueWebhook.payload.pull_request.id +=
                                    i * 1000;
                                uniqueWebhook.payload.pull_request.number +=
                                    i * 10;
                                uniqueWebhook.payload.pull_request.title += ` (Teste ${i + 1})`;
                            } else if (
                                uniqueWebhook.payload.object_attributes
                            ) {
                                uniqueWebhook.payload.object_attributes.id +=
                                    i * 1000;
                                uniqueWebhook.payload.object_attributes.iid +=
                                    i * 10;
                                uniqueWebhook.payload.object_attributes.title += ` (Teste ${i + 1})`;
                            } else if (uniqueWebhook.payload.pullrequest) {
                                uniqueWebhook.payload.pullrequest.id +=
                                    i * 1000;
                                uniqueWebhook.payload.pullrequest.title += ` (Teste ${i + 1})`;
                            }

                            expandedWebhooks.push(uniqueWebhook);
                        }
                    },
                );

                return expandedWebhooks;
            }
        } catch (error) {
            console.error('Erro ao carregar webhooks:', error);
        }

        throw new Error(
            `Arquivo de webhooks não encontrado: ${CONFIG.test.webhooksPath}`,
        );
    }

    // Conecta ao MongoDB
    async connectToMongoDB() {
        try {
            this.mongoClient = new MongoClient(CONFIG.mongodb.uri);
            await this.mongoClient.connect();
            this.db = this.mongoClient.db(CONFIG.mongodb.dbName);
            console.log('Conectado ao MongoDB com sucesso');
        } catch (error) {
            console.error('Erro ao conectar ao MongoDB:', error);
            this.mongoClient = null;
            this.db = null;
        }
    }

    // Fecha a conexão com o MongoDB
    async closeMongoDB() {
        if (this.mongoClient) {
            await this.mongoClient.close();
            console.log('Conexão com MongoDB fechada');
        }
    }

    // Envia um webhook
    async sendWebhook(webhook, index) {
        const { event, platform, clientId, payload } = webhook;
        const startTime = Date.now();

        // Determina o endpoint correto com base na plataforma
        let endpoint = '/github/webhook';
        let eventHeaderName = 'X-GitHub-Event';

        if (platform === 'gitlab') {
            endpoint = '/gitlab/webhook';
            eventHeaderName = 'X-Gitlab-Event';
        } else if (platform === 'bitbucket') {
            endpoint = '/bitbucket/webhook';
            eventHeaderName = 'X-Event-Key';
        }

        try {
            const response = await axios.post(
                `${CONFIG.app.baseUrl}${endpoint}`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        [eventHeaderName]: event,
                        'X-Webhook-Delivery': `webhook-${Date.now()}-${index}`,
                        'X-Client-ID': clientId || 'test-client',
                    },
                    timeout: 10000, // 10 segundos de timeout por requisição
                },
            );

            const duration = Date.now() - startTime;
            console.log(
                `Webhook #${index + 1} (${platform}/${event}) enviado com sucesso em ${duration}ms - Status: ${response.status}`,
            );

            return {
                success: true,
                duration,
                status: response.status,
                platform,
                event,
                clientId,
                index,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(
                `Erro ao enviar webhook #${index + 1} (${platform}/${event}) após ${duration}ms:`,
                error.message,
            );

            return {
                success: false,
                duration,
                error: error.message,
                platform,
                event,
                clientId,
                index,
                timestamp: new Date().toISOString(),
            };
        }
    }

    // Verifica o processamento no MongoDB
    async verifyProcessing(webhook, result) {
        if (!this.db || !result.success) return false;

        try {
            // Espera um pouco para dar tempo ao processamento
            await new Promise((resolve) => setTimeout(resolve, 5000));

            let prNumber, repoName;

            // Extrai informações relevantes com base na plataforma
            if (webhook.platform === 'github') {
                prNumber = webhook.payload.pull_request?.number;
                repoName = webhook.payload.repository?.name;
            } else if (webhook.platform === 'gitlab') {
                prNumber = webhook.payload.object_attributes?.iid;
                repoName = webhook.payload.repository?.name;
            } else if (webhook.platform === 'bitbucket') {
                prNumber = webhook.payload.pullrequest?.id;
                repoName = webhook.payload.repository?.name;
            }

            if (!prNumber || !repoName) return false;

            // Verifica se o PR foi salvo no banco
            const pullRequestsCollection = this.db.collection(
                CONFIG.mongodb.collections.pullRequests,
            );
            const automationExecutionsCollection = this.db.collection(
                CONFIG.mongodb.collections.automationExecutions,
            );

            const prRecord = await pullRequestsCollection.findOne({
                'prNumber': prNumber,
                'repository.name': repoName,
            });

            const executionRecord =
                await automationExecutionsCollection.findOne({
                    'pullRequest.number': prNumber,
                    'repository.name': repoName,
                });

            const processed = {
                prSaved: !!prRecord,
                executionStarted: !!executionRecord,
                prId: prRecord?._id?.toString(),
                executionId: executionRecord?._id?.toString(),
            };

            console.log(
                `Verificação de processamento para webhook #${result.index + 1}: ${JSON.stringify(processed)}`,
            );

            return processed;
        } catch (error) {
            console.error(
                `Erro ao verificar processamento para webhook #${result.index + 1}:`,
                error,
            );
            return false;
        }
    }

    // Simula uma chamada LLM
    async simulateLLMCall(webhook, result) {
        if (!CONFIG.test.simulateLLM || !result.success) return null;

        try {
            // Simula o tempo de resposta de um LLM
            const responseTime =
                CONFIG.llmMock.avgResponseTime +
                (Math.random() * 2 - 1) * CONFIG.llmMock.responseTimeVariation;

            await new Promise((resolve) => setTimeout(resolve, responseTime));

            // Tenta fazer uma chamada ao serviço de mock, se configurado
            try {
                await axios.post(
                    CONFIG.llmMock.endpoint,
                    {
                        webhook: webhook.event,
                        platform: webhook.platform,
                        clientId: webhook.clientId,
                        timestamp: new Date().toISOString(),
                    },
                    { timeout: 5000 },
                );
            } catch (e) {
                // Ignora erros do serviço de mock, já que é opcional
            }

            console.log(
                `Simulação de chamada LLM para webhook #${result.index + 1} concluída em ${responseTime.toFixed(0)}ms`,
            );

            return {
                simulated: true,
                responseTime,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            console.error(
                `Erro ao simular chamada LLM para webhook #${result.index + 1}:`,
                error,
            );
            return null;
        }
    }

    // Executa o teste completo
    async runTest() {
        console.log(`Iniciando teste com ${this.webhooks.length} webhooks...`);
        console.log(`URL base: ${CONFIG.app.baseUrl}`);
        console.log(`Intervalo entre requisições: ${CONFIG.test.interval}ms`);
        console.log(
            `Verificação MongoDB: ${CONFIG.test.verifyMongoDB ? 'Ativada' : 'Desativada'}`,
        );
        console.log(
            `Simulação LLM: ${CONFIG.test.simulateLLM ? 'Ativada' : 'Desativada'}`,
        );
        console.log('-----------------------------------------------');

        this.startTime = Date.now();
        this.results = [];

        // Função para enviar webhooks com intervalo
        const sendWebhooksWithInterval = async () => {
            for (let i = 0; i < this.webhooks.length; i++) {
                const webhook = this.webhooks[i];

                // Envia o webhook
                const result = await this.sendWebhook(webhook, i);

                // Verifica o processamento no MongoDB (assíncrono)
                let processingResult = false;
                if (CONFIG.test.verifyMongoDB && this.db) {
                    processingResult = await this.verifyProcessing(
                        webhook,
                        result,
                    );
                }

                // Simula chamada LLM (assíncrono)
                let llmResult = null;
                if (CONFIG.test.simulateLLM) {
                    llmResult = await this.simulateLLMCall(webhook, result);
                }

                // Armazena o resultado
                this.results.push({
                    ...result,
                    processing: processingResult,
                    llm: llmResult,
                });

                // Aguarda o intervalo antes do próximo webhook
                if (i < this.webhooks.length - 1 && CONFIG.test.interval > 0) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, CONFIG.test.interval),
                    );
                }
            }
        };

        // Configura um timeout geral para o teste
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(
                    new Error(
                        `Teste excedeu o timeout de ${CONFIG.test.timeout / 1000} segundos`,
                    ),
                );
            }, CONFIG.test.timeout);
        });

        try {
            // Executa o teste com timeout
            await Promise.race([sendWebhooksWithInterval(), timeoutPromise]);

            // Analisa os resultados
            await this.analyzeResults();
        } catch (error) {
            console.error('Teste falhou:', error.message);
        } finally {
            // Fecha a conexão com o MongoDB
            await this.closeMongoDB();
        }
    }

    // Analisa os resultados do teste
    async analyzeResults() {
        const totalDuration = Date.now() - this.startTime;
        const successCount = this.results.filter((r) => r.success).length;
        const successRate = (successCount / this.webhooks.length) * 100;

        // Calcula estatísticas por plataforma
        const platformStats = {};
        this.results.forEach((result) => {
            const platform = result.platform;
            if (!platformStats[platform]) {
                platformStats[platform] = {
                    total: 0,
                    success: 0,
                    failed: 0,
                    avgDuration: 0,
                    totalDuration: 0,
                };
            }

            platformStats[platform].total++;
            if (result.success) {
                platformStats[platform].success++;
                platformStats[platform].totalDuration += result.duration;
            } else {
                platformStats[platform].failed++;
            }
        });

        // Calcula médias
        Object.values(platformStats).forEach((stats) => {
            stats.avgDuration =
                stats.success > 0 ? stats.totalDuration / stats.success : 0;
            stats.successRate =
                stats.total > 0 ? (stats.success / stats.total) * 100 : 0;
        });

        // Calcula estatísticas de processamento
        const processedCount = this.results.filter(
            (r) => r.processing && r.processing.prSaved,
        ).length;
        const executionStartedCount = this.results.filter(
            (r) => r.processing && r.processing.executionStarted,
        ).length;
        const processingRate = (processedCount / successCount) * 100;
        const executionRate = (executionStartedCount / successCount) * 100;

        // Calcula estatísticas de LLM
        const llmSimulatedCount = this.results.filter(
            (r) => r.llm && r.llm.simulated,
        ).length;
        const llmRate = (llmSimulatedCount / successCount) * 100;
        const avgLLMTime =
            this.results
                .filter((r) => r.llm && r.llm.simulated)
                .reduce((sum, r) => sum + r.llm.responseTime, 0) /
            (llmSimulatedCount || 1);

        // Exibe resultados
        console.log('-----------------------------------------------');
        console.log(`Teste concluído em ${totalDuration / 1000} segundos`);
        console.log(`Webhooks enviados: ${this.webhooks.length}`);
        console.log(
            `Webhooks com sucesso: ${successCount}/${this.webhooks.length} (${successRate.toFixed(2)}%)`,
        );
        console.log(
            `Webhooks processados (MongoDB): ${processedCount}/${successCount} (${processingRate.toFixed(2)}%)`,
        );
        console.log(
            `Execuções iniciadas: ${executionStartedCount}/${successCount} (${executionRate.toFixed(2)}%)`,
        );
        console.log(
            `Chamadas LLM simuladas: ${llmSimulatedCount}/${successCount} (${llmRate.toFixed(2)}%)`,
        );
        console.log(`Tempo médio de resposta LLM: ${avgLLMTime.toFixed(2)}ms`);

        console.log('\nEstatísticas por plataforma:');
        Object.entries(platformStats).forEach(([platform, stats]) => {
            console.log(
                `  ${platform}: ${stats.success}/${stats.total} (${stats.successRate.toFixed(2)}%) - Média: ${stats.avgDuration.toFixed(2)}ms`,
            );
        });

        // Salva os resultados em um arquivo
        const resultPath = path.join(__dirname, 'full-flow-results.json');
        fs.writeFileSync(
            resultPath,
            JSON.stringify(
                {
                    timestamp: new Date().toISOString(),
                    config: CONFIG,
                    summary: {
                        totalDuration,
                        totalWebhooks: this.webhooks.length,
                        successCount,
                        failureCount: this.webhooks.length - successCount,
                        successRate,
                        processedCount,
                        processingRate,
                        executionStartedCount,
                        executionRate,
                        llmSimulatedCount,
                        llmRate,
                        avgLLMTime,
                        platformStats,
                    },
                    results: this.results,
                },
                null,
                2,
            ),
        );

        console.log(`\nResultados detalhados salvos em: ${resultPath}`);

        // Estima a capacidade do sistema
        const webhooksPerSecond = successCount / (totalDuration / 1000);
        const webhooksPerMinute = webhooksPerSecond * 60;
        const webhooksPerHour = webhooksPerMinute * 60;

        console.log('\nCapacidade estimada do sistema:');
        console.log(`  ${webhooksPerSecond.toFixed(2)} webhooks/segundo`);
        console.log(`  ${webhooksPerMinute.toFixed(2)} webhooks/minuto`);
        console.log(`  ${webhooksPerHour.toFixed(2)} webhooks/hora`);

        if (webhooksPerSecond < 1) {
            console.log(
                '\nALERTA: A capacidade do sistema está abaixo de 1 webhook por segundo.',
            );
            console.log(
                'Isso pode indicar problemas de performance que precisam ser investigados.',
            );
        }
    }
}

// Função principal
async function runFullFlowTest() {
    try {
        const simulator = await new FullFlowSimulator().initialize();
        await simulator.runTest();
    } catch (error) {
        console.error('Erro ao executar teste de fluxo completo:', error);
    }
}

// Executa o teste
runFullFlowTest();
