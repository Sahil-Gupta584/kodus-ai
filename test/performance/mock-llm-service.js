/**
 * Serviço de mock para simular chamadas LLM sem gerar custos
 * Este serviço simula o comportamento de APIs de LLM com tempos de resposta realistas
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// Configurações
const CONFIG = {
    port: process.env.MOCK_LLM_PORT || 8080,
    // Tempo médio de resposta em ms (ajustado para valores mais realistas)
    avgResponseTime: 30000, // 30 segundos (média entre 15s e 50s)
    // Variação do tempo de resposta em ms
    responseTimeVariation: 15000, // ±15 segundos (para variar entre 15s e 50s)
    // Probabilidade de erro (0-1)
    errorProbability: 0.05,
    // Distribuição do tempo de resposta
    // 'normal' = distribuição normal (gaussiana)
    // 'uniform' = distribuição uniforme
    // 'bimodal' = distribuição bimodal (picos em valores baixos e altos)
    responseTimeDistribution: 'bimodal',
    // Registrar todas as chamadas
    logCalls: true,
};

// Respostas pru00e9-definidas para diferentes tipos de anu00e1lise
const MOCK_RESPONSES = {
    codeReview: {
        suggestions: [
            {
                id: 'sugg-001',
                title: 'Possu00edvel operau00e7u00e3o bloqueante no event loop',
                description:
                    'Esta operau00e7u00e3o su00edncrona pode bloquear o event loop do Node.js, causando lentidu00e3o em outras requisiu00e7u00f5es.',
                category: 'PERFORMANCE',
                severity: 'HIGH',
                codeSnippet: 'const result = heavyOperation(data);',
                suggestedFix: 'const result = await heavyOperationAsync(data);',
                confidence: 0.92,
            },
            {
                id: 'sugg-002',
                title: 'Consulta ao MongoDB sem u00edndice',
                description:
                    'Esta consulta pode ser lenta em coleu00e7u00f5es grandes porque nu00e3o estu00e1 utilizando um u00edndice.',
                category: 'PERFORMANCE',
                severity: 'MEDIUM',
                codeSnippet:
                    'const docs = await collection.find({ field: value }).toArray();',
                suggestedFix: `await collection.createIndex({ field: 1 }); const docs = await collection.find({ field: value }).toArray();`,
                confidence: 0.85,
            },
            {
                id: 'sugg-003',
                title: 'Tratamento de erro insuficiente',
                description:
                    'Esta funu00e7u00e3o nu00e3o trata adequadamente erros que podem ocorrer durante a execuu00e7u00e3o.',
                category: 'ERROR_HANDLING',
                severity: 'MEDIUM',
                codeSnippet: `function processData(data) {
  const result = transform(data);
  return saveToDatabase(result);
}`,
                suggestedFix: `async function processData(data) {
  try {
    const result = transform(data);
    return await saveToDatabase(result);
  } catch (error) {
    logger.error("Error processing data", error);
    throw new ProcessingError("Failed to process data", error);
  }
}`,
                confidence: 0.88,
            },
        ],
        codeReviewModelUsed: {
            generateSuggestions: 'CHATGPT_4_ALL',
        },
    },
    safeguard: {
        validSuggestions: [
            {
                id: 'sugg-001',
                title: 'Possu00edvel operau00e7u00e3o bloqueante no event loop',
                category: 'PERFORMANCE',
                severity: 'HIGH',
            },
            {
                id: 'sugg-003',
                title: 'Tratamento de erro insuficiente',
                category: 'ERROR_HANDLING',
                severity: 'MEDIUM',
            },
        ],
        discardedSuggestions: [
            {
                id: 'sugg-002',
                title: 'Consulta ao MongoDB sem u00edndice',
                category: 'PERFORMANCE',
                severity: 'MEDIUM',
                reason: 'Ju00e1 existe um u00edndice para este campo no esquema',
            },
        ],
    },
    reviewMode: {
        mode: 'LIGHT_MODE',
    },
};

// Cria o aplicativo Express
const app = express();

// Configura middleware
app.use(cors());
app.use(bodyParser.json());

// Função para simular o tempo de resposta com diferentes distribuições
function simulateResponseTime() {
    const { avgResponseTime, responseTimeVariation, responseTimeDistribution } =
        CONFIG;

    let randomFactor;

    switch (responseTimeDistribution) {
        case 'normal':
            // Distribuição normal (soma de variáveis aleatórias)
            randomFactor =
                (Math.random() +
                    Math.random() +
                    Math.random() +
                    Math.random() -
                    2) /
                2;
            break;
        case 'bimodal':
            // Distribuição bimodal (tende a ser rápido ou lento, menos valores médios)
            const mode = Math.random() > 0.5 ? 1 : -1;
            randomFactor = mode * (0.5 + Math.random() * 0.5);
            break;
        case 'uniform':
        default:
            // Distribuição uniforme
            randomFactor = Math.random() * 2 - 1;
            break;
    }

    // Calcula o tempo de resposta baseado na média, variação e fator aleatório
    const responseTime = avgResponseTime + randomFactor * responseTimeVariation;

    // Garante que o tempo seja pelo menos 1ms
    return Math.max(1, Math.round(responseTime));
}

// Middleware para simular atraso na resposta
const simulateDelay = (req, res, next) => {
    const responseTime = simulateResponseTime();
    setTimeout(next, responseTime);
};

// Middleware para registrar chamadas
const logRequest = (req, res, next) => {
    if (CONFIG.logCalls) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${req.method} ${req.path}`);
        console.log('Headers:', JSON.stringify(req.headers));
        console.log('Body:', JSON.stringify(req.body));
    }
    next();
};

// Middleware para simular erros ocasionais
const simulateErrors = (req, res, next) => {
    if (Math.random() < CONFIG.errorProbability) {
        return res.status(500).json({
            error: 'Simulated LLM service error',
            message: 'This is a simulated error response',
            timestamp: new Date().toISOString(),
        });
    }
    next();
};

// Aplica middleware global
app.use(logRequest);
app.use(simulateDelay);
app.use(simulateErrors);

// Endpoint principal para mock de LLM
app.post('/mock-llm', (req, res) => {
    // Determina qual tipo de resposta enviar com base no corpo da requisição
    const responseType = req.body.responseType || 'codeReview';

    // Envia a resposta mockada
    res.json({
        ...MOCK_RESPONSES[responseType],
        timestamp: new Date().toISOString(),
        requestId: `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    });
});

// Endpoint específico para code review
app.post('/mock-llm/code-review', (req, res) => {
    res.json({
        ...MOCK_RESPONSES.codeReview,
        timestamp: new Date().toISOString(),
        requestId: `cr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    });
});

// Endpoint para safeguard
app.post('/mock-llm/safeguard', (req, res) => {
    res.json({
        ...MOCK_RESPONSES.safeguard,
        timestamp: new Date().toISOString(),
        requestId: `sg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    });
});

// Endpoint para seleção de modo de revisão
app.post('/mock-llm/review-mode', (req, res) => {
    res.json({
        ...MOCK_RESPONSES.reviewMode,
        timestamp: new Date().toISOString(),
        requestId: `rm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    });
});

// Endpoint de status/healthcheck
app.get('/status', (req, res) => {
    res.json({
        status: 'ok',
        service: 'mock-llm-service',
        timestamp: new Date().toISOString(),
        config: {
            ...CONFIG,
            // Não incluir informações sensíveis
        },
    });
});

// Inicia o servidor
app.listen(CONFIG.port, () => {
    console.log(`Serviço de mock LLM iniciado na porta ${CONFIG.port}`);
    console.log(
        `Tempo médio de resposta: ${CONFIG.avgResponseTime / 1000}s (±${CONFIG.responseTimeVariation / 1000}s)`,
    );
    console.log(`Distribuição do tempo: ${CONFIG.responseTimeDistribution}`);
    console.log(`Probabilidade de erro: ${CONFIG.errorProbability * 100}%`);
    console.log('Endpoints disponíveis:');
    console.log(`  POST http://localhost:${CONFIG.port}/mock-llm`);
    console.log(`  POST http://localhost:${CONFIG.port}/mock-llm/code-review`);
    console.log(`  POST http://localhost:${CONFIG.port}/mock-llm/safeguard`);
    console.log(`  POST http://localhost:${CONFIG.port}/mock-llm/review-mode`);
    console.log(`  GET  http://localhost:${CONFIG.port}/status`);
});
