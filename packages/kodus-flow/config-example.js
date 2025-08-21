/**
 * Exemplo de configuração completa para MongoDB
 */

// ✅ CONFIGURAÇÃO COMPLETA (Recomendado)
const configCompleta = {
    tenantId: 'kodus-agent-conversation',
    llmAdapter: this.llmAdapter,
    mcpAdapter: this.mcpAdapter,
    observability: {
        logging: { enabled: true, level: 'info' },
        telemetry: { enabled: true },
        mongodb: {
            type: 'mongodb',
            connectionString: uri,
            database: this.config.database,
            collections: {
                logs: 'observability_logs',
                telemetry: 'observability_telemetry',
                metrics: 'observability_metrics',
                errors: 'observability_errors',
            },
            // ✅ PARÂMETROS OBRIGATÓRIOS
            batchSize: 100, // Tamanho do batch
            flushIntervalMs: 5000, // Intervalo de flush (5s)
            ttlDays: 30, // Tempo de vida dos dados
            enableObservability: true, // Habilitar observabilidade
        },
    },
};

// ❌ CONFIGURAÇÃO INCOMPLETA (Pode não funcionar)
const configIncompleta = {
    tenantId: 'kodus-agent-conversation',
    llmAdapter: this.llmAdapter,
    mcpAdapter: this.mcpAdapter,
    observability: {
        logging: { enabled: true, level: 'info' },
        mongodb: {
            type: 'mongodb',
            connectionString: uri,
            database: this.config.database,
            collections: {
                logs: 'observability_logs',
                telemetry: 'observability_telemetry',
                metrics: 'observability_metrics',
                errors: 'observability_errors',
            },
            // ❌ FALTANDO PARÂMETROS
            // batchSize: 100,
            // flushIntervalMs: 5000,
            // ttlDays: 30,
            // enableObservability: true,
        },
    },
};

console.log('✅ Use a configuração completa para garantir que funcione!');
