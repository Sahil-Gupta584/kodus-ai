/**
 * Script para simular webhooks e testar a carga da aplicau00e7u00e3o
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configurau00e7u00f5es
const CONFIG = {
    // URL base da API (altere para o seu ambiente)
    baseUrl: 'http://localhost:3000',
    // Nu00famero de webhooks a serem enviados
    totalWebhooks: 20,
    // Intervalo entre os webhooks em ms (0 para enviar o mais ru00e1pido possu00edvel)
    interval: 500,
    // Tempo mu00e1ximo de espera para conclusu00e3o em ms
    timeout: 120000,
    // Caminho para o arquivo de webhooks
    webhooksPath: path.join(__dirname, 'data/webhooks.json'),
};

// Funu00e7u00e3o para carregar os webhooks
function loadWebhooks() {
    try {
        if (fs.existsSync(CONFIG.webhooksPath)) {
            const webhooksContent = fs.readFileSync(
                CONFIG.webhooksPath,
                'utf8',
            );
            return JSON.parse(webhooksContent);
        }
    } catch (error) {
        console.error('Erro ao carregar webhooks:', error);
    }

    throw new Error(
        `Arquivo de webhooks nu00e3o encontrado: ${CONFIG.webhooksPath}`,
    );
}

// Funu00e7u00e3o para enviar um webhook
async function sendWebhook(webhook, index) {
    const { event, payload } = webhook;
    const startTime = Date.now();

    try {
        const response = await axios.post(
            `${CONFIG.baseUrl}/github/webhook`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-GitHub-Event': event,
                    'X-GitHub-Delivery': `webhook-${Date.now()}-${index}`,
                },
                timeout: 10000, // 10 segundos de timeout por requisiu00e7u00e3o
            },
        );

        const duration = Date.now() - startTime;
        console.log(
            `Webhook #${index + 1} enviado com sucesso em ${duration}ms - Status: ${response.status}`,
        );
        return { success: true, duration, status: response.status };
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(
            `Erro ao enviar webhook #${index + 1} apu00f3s ${duration}ms:`,
            error.message,
        );
        return { success: false, duration, error: error.message };
    }
}

// Funu00e7u00e3o principal para executar o teste de carga
async function runLoadTest() {
    console.log(
        `Iniciando teste de carga com ${CONFIG.totalWebhooks} webhooks...`,
    );
    console.log(`URL: ${CONFIG.baseUrl}/github/webhook`);
    console.log(`Intervalo entre requisiu00e7u00f5es: ${CONFIG.interval}ms`);
    console.log('-----------------------------------------------');

    const startTime = Date.now();
    const webhooks = loadWebhooks();
    const results = [];

    // Funu00e7u00e3o para enviar webhooks com intervalo
    const sendWebhooksWithInterval = async () => {
        for (let i = 0; i < CONFIG.totalWebhooks; i++) {
            // Seleciona um webhook aleatu00f3rio da lista
            const webhookIndex = i % webhooks.length;
            const webhook = webhooks[webhookIndex];

            const result = await sendWebhook(webhook, i);
            results.push(result);

            if (i < CONFIG.totalWebhooks - 1 && CONFIG.interval > 0) {
                await new Promise((resolve) =>
                    setTimeout(resolve, CONFIG.interval),
                );
            }
        }
    };

    // Configura um timeout geral para o teste
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(
                new Error(
                    `Teste de carga excedeu o timeout de ${CONFIG.timeout / 1000} segundos`,
                ),
            );
        }, CONFIG.timeout);
    });

    try {
        // Executa o teste com timeout
        await Promise.race([sendWebhooksWithInterval(), timeoutPromise]);

        const totalDuration = Date.now() - startTime;
        const successCount = results.filter((r) => r.success).length;
        const avgDuration =
            results.reduce((sum, r) => sum + r.duration, 0) / results.length;

        console.log('-----------------------------------------------');
        console.log(`Teste de carga concluu00eddo em ${totalDuration}ms`);
        console.log(
            `Webhooks enviados com sucesso: ${successCount}/${CONFIG.totalWebhooks} (${((successCount / CONFIG.totalWebhooks) * 100).toFixed(2)}%)`,
        );
        console.log(`Mu00e9dia de ${avgDuration.toFixed(2)}ms por webhook`);

        // Salva os resultados em um arquivo
        const resultPath = path.join(__dirname, 'webhook-results.json');
        fs.writeFileSync(
            resultPath,
            JSON.stringify(
                {
                    timestamp: new Date().toISOString(),
                    config: CONFIG,
                    summary: {
                        totalDuration,
                        totalWebhooks: CONFIG.totalWebhooks,
                        successCount,
                        failureCount: CONFIG.totalWebhooks - successCount,
                        avgDuration,
                    },
                    results,
                },
                null,
                2,
            ),
        );

        console.log(`Resultados detalhados salvos em: ${resultPath}`);
    } catch (error) {
        console.error('Teste de carga falhou:', error.message);
    }
}

// Executa o teste
runLoadTest();
