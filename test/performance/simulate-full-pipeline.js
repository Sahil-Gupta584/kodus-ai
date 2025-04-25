/**
 * Simulador do pipeline completo de code review
 * Este script simula o fluxo completo de processamento de code review,
 * incluindo todos os estágios do pipeline, logs no MongoDB e chamadas LLM
 */

const { MongoClient } = require('mongodb');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configurações
const CONFIG = {
    // Configurações da aplicação
    app: {
        baseUrl: 'http://localhost:3001', // Atualizado para porta 3001 conforme .env
        timeout: 180000, // 3 minutos
    },
    // Configurações de teste
    test: {
        // Número de simulações a executar
        simulationCount: 3,
        // Intervalo entre simulações em ms
        interval: 10000,
        // Tempo máximo de espera para conclusão em ms
        timeout: 600000, // 10 minutos
        // Se deve verificar o MongoDB para confirmar processamento
        verifyMongoDB: true,
        // Se deve simular chamadas LLM
        simulateLLM: true,
        // Se deve simular logs
        simulateLogs: true,
        // Se deve falhar o teste se houver erro no MongoDB
        failOnMongoDBError: false,
    },
    // Configurações do MongoDB
    mongodb: {
        host: 'localhost',
        port: '27017',
        username: 'kodusdev',
        password: '123456',
        database: 'kodus_db',
        collections: {
            logs: 'logs',
            pullRequests: 'pullrequests',
            automationExecutions: 'automationexecutions',
        },
    },
    // Configurações do mock de LLM
    llmMock: {
        // Endpoint do serviço de mock
        endpoint: 'http://localhost:8080/mock-llm',
        // Tempo médio de resposta simulado (ms)
        avgResponseTime: 30000, // 30 segundos
        // Variação do tempo de resposta (ms)
        responseTimeVariation: 15000, // ±15 segundos
    },
    // Configurações do pipeline
    pipeline: {
        // Estágios do pipeline
        stages: [
            'ValidatePayload',
            'PrepareContext',
            'FetchChangedFiles',
            'ProcessFilesReview',  // Estágio mais pesado (chamadas LLM)
            'AggregateResults',
            'UpdateCommentsAndGenerateSummary',
            'NotifyResults'
        ],
        // Tempo base de processamento por estágio (ms)
        stageTimings: {
            'ValidatePayload': 500,
            'PrepareContext': 1000,
            'FetchChangedFiles': 2000,
            'ProcessFilesReview': 5000,  // Tempo base, sem contar chamadas LLM
            'AggregateResults': 2000,
            'UpdateCommentsAndGenerateSummary': 3000,
            'NotifyResults': 1000
        },
        // Configurações de processamento em lotes
        batchProcessing: {
            // Limite de concorrência (similar ao pLimit no código real)
            concurrencyLimit: 5,
            // Tamanho mínimo do lote
            minBatchSize: 2,
            // Tamanho máximo do lote
            maxBatchSize: 4
        }
    },
};

// Classe para simular o pipeline completo
class FullPipelineSimulator {
    constructor() {
        this.results = [];
        this.startTime = 0;
        this.mongoClient = null;
        this.db = null;
    }

    // Inicializa o simulador
    async initialize() {
        console.log('Inicializando simulador de pipeline completo...');

        // Conecta ao MongoDB se necessário
        if (CONFIG.test.verifyMongoDB) {
            await this.connectToMongoDB();
        }

        return this;
    }

    // Conecta ao MongoDB
    async connectToMongoDB() {
        if (!CONFIG.test.verifyMongoDB) return;

        try {
            console.log('Conectando ao MongoDB...');
            
            // Construção da URI de conexão similar ao mongoose.factory.ts
            const mongoUri = `mongodb://${CONFIG.mongodb.username}:${CONFIG.mongodb.password}@${CONFIG.mongodb.host}:${CONFIG.mongodb.port}/${CONFIG.mongodb.database}?authSource=admin`;
            
            console.log(`Tentando conectar ao MongoDB: ${CONFIG.mongodb.host}:${CONFIG.mongodb.port}/${CONFIG.mongodb.database}`);
            
            const client = new MongoClient(mongoUri);

            await client.connect();
            this.db = client.db(CONFIG.mongodb.database);
            console.log('Conexão com MongoDB estabelecida com sucesso!');
        } catch (error) {
            console.error('Erro ao conectar ao MongoDB:', error.message);
            if (CONFIG.test.failOnMongoDBError) {
                throw error;
            }
        }
    }

    // Fecha a conexão com o MongoDB
    async closeMongoDB() {
        if (this.mongoClient) {
            await this.mongoClient.close();
            console.log('Conexão com MongoDB fechada');
        }
    }

    // Simula o envio de um webhook
    async simulateWebhook(index) {
        const startTime = Date.now();
        const webhookId = `webhook-${Date.now()}-${index}`;

        try {
            // Simula payload de um pull request do GitHub
            const payload = {
                action: 'opened',
                pull_request: {
                    id: 1000 + index,
                    number: 100 + index,
                    title: `Test PR #${index + 1}`,
                    body: 'This is a test pull request',
                    head: {
                        ref: 'feature-branch',
                        sha: `abc123def456${index}`,
                    },
                    base: {
                        ref: 'main',
                    },
                    user: {
                        login: 'test-user',
                    },
                },
                repository: {
                    id: 500 + index,
                    name: 'test-repo',
                    full_name: 'test-org/test-repo',
                    language: 'TypeScript',
                },
            };

            // Envia o webhook
            const response = await axios.post(
                `${CONFIG.app.baseUrl}/github/webhook`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-GitHub-Event': 'pull_request',
                        'X-GitHub-Delivery': webhookId,
                        'X-Client-ID': 'test-client',
                    },
                    timeout: 10000, // 10 segundos de timeout por requisição
                },
            );

            const duration = Date.now() - startTime;
            console.log(
                `Webhook #${index + 1} enviado com sucesso em ${duration}ms - Status: ${response.status}`,
            );

            return {
                success: true,
                duration,
                status: response.status,
                webhookId,
                prNumber: payload.pull_request.number,
                repoName: payload.repository.name,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(
                `Erro ao enviar webhook #${index + 1} após ${duration}ms:`,
                error.message,
            );

            return {
                success: false,
                duration,
                error: error.message,
                webhookId,
                timestamp: new Date().toISOString(),
            };
        }
    }

    // Simula o processamento do pipeline
    async simulatePipeline(webhookResult) {
        if (!webhookResult.success) return null;

        console.log(`Simulando pipeline para PR #${webhookResult.prNumber}...`);

        const pipelineResult = {
            webhookId: webhookResult.webhookId,
            prNumber: webhookResult.prNumber,
            repoName: webhookResult.repoName,
            stages: [],
            startTime: new Date().toISOString(),
            endTime: null,
            totalDuration: 0,
            success: true,
            logs: [],
            llmCalls: [],
        };

        const pipelineStartTime = Date.now();

        // Simula cada estágio do pipeline
        for (const stageName of CONFIG.pipeline.stages) {
            const stageStartTime = Date.now();
            const stageBaseTime =
                CONFIG.pipeline.stageTimings[stageName] || 1000;

            try {
                // Simula o processamento do estágio
                await this.simulateStageProcessing(
                    stageName,
                    webhookResult,
                    pipelineResult,
                );

                const stageDuration = Date.now() - stageStartTime;
                pipelineResult.stages.push({
                    name: stageName,
                    duration: stageDuration,
                    success: true,
                    timestamp: new Date().toISOString(),
                });

                console.log(
                    `  Estágio ${stageName} concluído em ${stageDuration}ms`,
                );

                // Simula logs para este estágio
                if (CONFIG.test.simulateLogs) {
                    await this.simulateLogs(stageName, webhookResult, 'info');
                    pipelineResult.logs.push({
                        stage: stageName,
                        level: 'info',
                        timestamp: new Date().toISOString(),
                    });
                }
            } catch (error) {
                const stageDuration = Date.now() - stageStartTime;
                pipelineResult.stages.push({
                    name: stageName,
                    duration: stageDuration,
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString(),
                });

                console.error(
                    `  Erro no estágio ${stageName} após ${stageDuration}ms:`,
                    error.message,
                );

                // Simula logs de erro
                if (CONFIG.test.simulateLogs) {
                    await this.simulateLogs(
                        stageName,
                        webhookResult,
                        'error',
                        error,
                    );
                    pipelineResult.logs.push({
                        stage: stageName,
                        level: 'error',
                        timestamp: new Date().toISOString(),
                    });
                }

                pipelineResult.success = false;
                break;
            }
        }

        pipelineResult.totalDuration = Date.now() - pipelineStartTime;
        pipelineResult.endTime = new Date().toISOString();

        console.log(
            `Pipeline para PR #${webhookResult.prNumber} ${pipelineResult.success ? 'concluído' : 'falhou'} em ${pipelineResult.totalDuration}ms`,
        );

        return pipelineResult;
    }

    // Simula o processamento de um estágio específico
    async simulateStageProcessing(stageName, webhookResult, pipelineResult) {
        // Simula o tempo base de processamento do estágio
        const baseTime = CONFIG.pipeline.stageTimings[stageName] || 1000;
        const randomFactor = 0.5 + Math.random();
        const processingTime = baseTime * randomFactor;

        await new Promise((resolve) => setTimeout(resolve, processingTime));

        // Estágios específicos com comportamentos especiais
        switch (stageName) {
            case 'ProcessFilesReview':
                // Simula múltiplas chamadas LLM durante o processamento de arquivos
                if (CONFIG.test.simulateLLM) {
                    const fileCount = 3 + Math.floor(Math.random() * 5); // 3-7 arquivos

                    // Cria arquivos simulados
                    const files = Array.from({ length: fileCount }, (_, i) => ({
                        id: `file-${i}`,
                        name: `file-${i}.ts`,
                        size: 1000 + Math.floor(Math.random() * 5000)
                    }));

                    // Divide os arquivos em lotes (similar ao createOptimizedBatches)
                    const batches = this.createBatches(files);
                    console.log(`  Processando ${fileCount} arquivos em ${batches.length} lotes`);

                    // Processa cada lote
                    for (const [batchIndex, batch] of batches.entries()) {
                        console.log(`  Processando lote ${batchIndex + 1}/${batches.length} com ${batch.length} arquivos`);

                        // Processa os arquivos do lote com concorrência limitada
                        const results = await this.processBatchWithConcurrencyLimit(batch, webhookResult);

                        // Adiciona os resultados
                        pipelineResult.llmCalls.push(...results);
                    }
                }
                break;

            case 'AggregateResults':
                // Simula uma chamada LLM para agregação
                if (CONFIG.test.simulateLLM) {
                    const llmResult = await this.simulateLLMCall(
                        'review-mode',
                        webhookResult,
                    );
                    pipelineResult.llmCalls.push(llmResult);
                }
                break;

            case 'UpdateCommentsAndGenerateSummary':
                // Simula uma chamada LLM para gerar resumo
                if (CONFIG.test.simulateLLM) {
                    const llmResult = await this.simulateLLMCall(
                        'safeguard',
                        webhookResult,
                    );
                    pipelineResult.llmCalls.push(llmResult);
                }
                break;
        }

        return true;
    }

    // Cria lotes de arquivos (similar ao createOptimizedBatches)
    createBatches(files) {
        const { minBatchSize, maxBatchSize } = CONFIG.pipeline.batchProcessing;
        const batches = [];
        let currentBatch = [];

        for (const file of files) {
            currentBatch.push(file);

            // Quando o lote atinge o tamanho máximo, adiciona ao array de lotes
            if (currentBatch.length >= maxBatchSize) {
                batches.push([...currentBatch]);
                currentBatch = [];
            }
        }

        // Adiciona o último lote se tiver pelo menos o tamanho mínimo
        if (currentBatch.length >= minBatchSize) {
            batches.push(currentBatch);
        } else if (currentBatch.length > 0) {
            // Se o último lote for menor que o mínimo, adiciona aos arquivos do último lote
            if (batches.length > 0) {
                batches[batches.length - 1].push(...currentBatch);
            } else {
                // Se não houver lotes anteriores, cria um novo
                batches.push(currentBatch);
            }
        }

        return batches;
    }

    // Processa um lote de arquivos com concorrência limitada (similar ao pLimit)
    async processBatchWithConcurrencyLimit(batch, webhookResult) {
        const { concurrencyLimit } = CONFIG.pipeline.batchProcessing;
        const results = [];

        // Implementa um mecanismo simples de concorrência limitada
        const processingQueue = [];

        for (const file of batch) {
            // Se já atingiu o limite de concorrência, aguarda uma tarefa ser concluída
            if (processingQueue.length >= concurrencyLimit) {
                await Promise.race(processingQueue);
                // Remove as tarefas concluídas da fila
                const completedIndex = await Promise.race(
                    processingQueue.map(async (p, i) => {
                        const isCompleted = await Promise.race([
                            p.then(() => true),
                            new Promise(resolve => setTimeout(() => resolve(false), 0))
                        ]);
                        return isCompleted ? i : -1;
                    })
                );
                if (completedIndex !== -1) {
                    processingQueue.splice(completedIndex, 1);
                }
            }

            // Adiciona a nova tarefa à fila
            const task = this.simulateLLMCall('code-review', webhookResult, file);
            processingQueue.push(task);

            // Adiciona o resultado quando a tarefa for concluída
            task.then(result => results.push(result));
        }

        // Aguarda todas as tarefas restantes serem concluídas
        await Promise.all(processingQueue);

        return results;
    }

    // Simula uma chamada LLM
    async simulateLLMCall(responseType, webhookResult, file = null) {
        if (!CONFIG.test.simulateLLM) return null;

        try {
            const startTime = Date.now();
            console.log(`  Iniciando chamada LLM (${responseType})${file ? ` para ${file.name}` : ''}...`);

            // Tenta fazer uma chamada ao serviço de mock
            const response = await axios.post(
                CONFIG.llmMock.endpoint,
                {
                    responseType,
                    prNumber: webhookResult.prNumber,
                    repoName: webhookResult.repoName,
                    webhookId: webhookResult.webhookId,
                    file: file,
                    timestamp: new Date().toISOString(),
                },
                { timeout: 60000 }, // 60 segundos de timeout
            );

            const duration = Date.now() - startTime;
            console.log(
                `  Chamada LLM (${responseType})${file ? ` para ${file.name}` : ''} concluída em ${duration}ms`,
            );

            return {
                type: responseType,
                file: file,
                duration,
                timestamp: new Date().toISOString(),
                success: true,
            };
        } catch (error) {
            console.error(
                `  Erro na chamada LLM (${responseType})${file ? ` para ${file.name}` : ''}:`,
                error.message,
            );
            return {
                type: responseType,
                file: file,
                error: error.message,
                timestamp: new Date().toISOString(),
                success: false,
            };
        }
    }

    // Simula logs no MongoDB usando setImmediate
    async simulateLogs(stageName, webhookResult, level = 'info', error = null) {
        if (!CONFIG.test.simulateLogs || !this.db) return;

        const logData = {
            timestamp: new Date().toISOString(),
            level,
            message: `${stageName} for PR #${webhookResult.prNumber}`,
            context: `CodeReviewPipeline.${stageName}`,
            metadata: {
                prNumber: webhookResult.prNumber,
                repoName: webhookResult.repoName,
                webhookId: webhookResult.webhookId,
            },
            error: error
                ? { message: error.message, stack: error.stack }
                : undefined,
        };

        // Simula o comportamento do setImmediate do pino.service.ts
        return new Promise((resolve) => {
            setImmediate(async () => {
                try {
                    if (this.db) {
                        await this.db
                            .collection(CONFIG.mongodb.collections.logs)
                            .insertOne(logData);
                    }
                    resolve();
                } catch (err) {
                    console.error('Erro ao salvar log:', err);
                    resolve();
                }
            });
        });
    }

    // Verifica o processamento no MongoDB
    async verifyProcessing(webhookResult) {
        if (!this.db || !webhookResult.success) return false;

        try {
            // Espera um pouco para dar tempo ao processamento
            await new Promise((resolve) => setTimeout(resolve, 5000));

            const { prNumber, repoName } = webhookResult;

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
                `Verificação de processamento para PR #${prNumber}: ${JSON.stringify(processed)}`,
            );

            return processed;
        } catch (error) {
            console.error(
                `Erro ao verificar processamento para PR #${webhookResult.prNumber}:`,
                error,
            );
            return false;
        }
    }

    // Executa o teste completo
    async runTest() {
        console.log(
            `Iniciando teste de pipeline com ${CONFIG.test.simulationCount} simulações...`,
        );
        console.log(`URL base: ${CONFIG.app.baseUrl}`);
        console.log(`Intervalo entre simulações: ${CONFIG.test.interval}ms`);
        console.log(
            `Verificação MongoDB: ${CONFIG.test.verifyMongoDB ? 'Ativada' : 'Desativada'}`,
        );
        console.log(
            `Simulação LLM: ${CONFIG.test.simulateLLM ? 'Ativada' : 'Desativada'}`,
        );
        console.log(
            `Simulação de logs: ${CONFIG.test.simulateLogs ? 'Ativada' : 'Desativada'}`,
        );
        console.log('-----------------------------------------------');

        this.startTime = Date.now();
        this.results = [];

        // Função para executar simulações com intervalo
        const runSimulationsWithInterval = async () => {
            for (let i = 0; i < CONFIG.test.simulationCount; i++) {
                console.log(`\nIniciando simulação #${i + 1}...`);

                // Simula o envio do webhook
                const webhookResult = await this.simulateWebhook(i);

                // Simula o processamento do pipeline
                let pipelineResult = null;
                if (webhookResult.success) {
                    pipelineResult = await this.simulatePipeline(webhookResult);
                }

                // Verifica o processamento no MongoDB (assíncrono)
                let processingResult = false;
                if (CONFIG.test.verifyMongoDB && this.db) {
                    processingResult =
                        await this.verifyProcessing(webhookResult);
                }

                // Armazena o resultado
                this.results.push({
                    webhook: webhookResult,
                    pipeline: pipelineResult,
                    processing: processingResult,
                });

                // Aguarda o intervalo antes da próxima simulação
                if (
                    i < CONFIG.test.simulationCount - 1 &&
                    CONFIG.test.interval > 0
                ) {
                    console.log(
                        `Aguardando ${CONFIG.test.interval / 1000}s antes da próxima simulação...`,
                    );
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
            await Promise.race([runSimulationsWithInterval(), timeoutPromise]);

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
        const webhookSuccessCount = this.results.filter(
            (r) => r.webhook.success,
        ).length;
        const pipelineSuccessCount = this.results.filter(
            (r) => r.pipeline && r.pipeline.success,
        ).length;
        const webhookSuccessRate =
            (webhookSuccessCount / CONFIG.test.simulationCount) * 100;
        const pipelineSuccessRate =
            (pipelineSuccessCount / webhookSuccessCount) * 100;

        // Calcula estatísticas de LLM
        const llmCalls = this.results
            .filter((r) => r.pipeline)
            .flatMap((r) => r.pipeline.llmCalls || []);

        const llmSuccessCount = llmCalls.filter((call) => call.success).length;
        const llmSuccessRate = (llmSuccessCount / llmCalls.length) * 100;
        const avgLLMTime =
            llmCalls
                .filter((call) => call.success)
                .reduce((sum, call) => sum + call.duration, 0) /
            (llmSuccessCount || 1);

        // Calcula estatísticas de estágios
        const stageStats = {};
        this.results
            .filter((r) => r.pipeline)
            .forEach((result) => {
                result.pipeline.stages.forEach((stage) => {
                    if (!stageStats[stage.name]) {
                        stageStats[stage.name] = {
                            count: 0,
                            successCount: 0,
                            totalDuration: 0,
                            avgDuration: 0,
                        };
                    }

                    stageStats[stage.name].count++;
                    if (stage.success) {
                        stageStats[stage.name].successCount++;
                        stageStats[stage.name].totalDuration += stage.duration;
                    }
                });
            });

        // Calcula médias
        Object.values(stageStats).forEach((stats) => {
            stats.avgDuration =
                stats.successCount > 0
                    ? stats.totalDuration / stats.successCount
                    : 0;
            stats.successRate =
                stats.count > 0 ? (stats.successCount / stats.count) * 100 : 0;
        });

        // Exibe resultados
        console.log('\n-----------------------------------------------');
        console.log(`Teste concluído em ${totalDuration / 1000} segundos`);
        console.log(`Webhooks enviados: ${CONFIG.test.simulationCount}`);
        console.log(
            `Webhooks com sucesso: ${webhookSuccessCount}/${CONFIG.test.simulationCount} (${webhookSuccessRate.toFixed(2)}%)`,
        );
        console.log(
            `Pipelines com sucesso: ${pipelineSuccessCount}/${webhookSuccessCount} (${pipelineSuccessRate.toFixed(2)}%)`,
        );
        console.log(
            `Chamadas LLM: ${llmCalls.length} (${llmSuccessRate.toFixed(2)}% sucesso)`,
        );
        console.log(
            `Tempo médio de resposta LLM: ${(avgLLMTime / 1000).toFixed(2)}s`,
        );

        console.log('\nEstatísticas por estágio:');
        Object.entries(stageStats).forEach(([stageName, stats]) => {
            console.log(
                `  ${stageName}: ${stats.successCount}/${stats.count} (${stats.successRate.toFixed(2)}%) - Média: ${stats.avgDuration.toFixed(2)}ms`,
            );
        });

        // Salva os resultados em um arquivo
        const resultPath = path.join(__dirname, 'pipeline-results.json');
        fs.writeFileSync(
            resultPath,
            JSON.stringify(
                {
                    timestamp: new Date().toISOString(),
                    config: CONFIG,
                    summary: {
                        totalDuration,
                        webhookSuccessCount,
                        pipelineSuccessCount,
                        webhookSuccessRate,
                        pipelineSuccessRate,
                        llmCalls: llmCalls.length,
                        llmSuccessRate,
                        avgLLMTime,
                        stageStats,
                    },
                    results: this.results,
                },
                null,
                2,
            ),
        );

        console.log(`\nResultados detalhados salvos em: ${resultPath}`);

        // Estima a capacidade do sistema
        const simulationsPerSecond =
            pipelineSuccessCount / (totalDuration / 1000);
        const simulationsPerMinute = simulationsPerSecond * 60;
        const simulationsPerHour = simulationsPerMinute * 60;

        console.log('\nCapacidade estimada do sistema:');
        console.log(`  ${simulationsPerSecond.toFixed(2)} PRs/segundo`);
        console.log(`  ${simulationsPerMinute.toFixed(2)} PRs/minuto`);
        console.log(`  ${simulationsPerHour.toFixed(2)} PRs/hora`);
    }
}

// Função principal
async function main() {
    try {
        const simulator = await new FullPipelineSimulator().initialize();
        await simulator.runTest();
    } catch (error) {
        console.error('Erro ao executar teste de pipeline completo:', error);
    }
}

// Executa o teste
main();
