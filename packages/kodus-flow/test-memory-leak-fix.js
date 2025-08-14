/**
 * Teste de Memory Leak Fix
 * Verifica se as correções implementadas resolveram os problemas de memória
 */

import { createRuntime } from './src/runtime/index.js';
import { getObservability } from './src/observability/index.js';
import { createWorkflowContext } from './src/core/context/index.js';

async function testMemoryLeakFix() {
    console.log('🧪 Testando correções de memory leak...\n');

    // Configurar observabilidade
    const observability = getObservability({
        enabled: true,
        environment: 'test',
        logging: {
            level: 'warn', // Reduzir logs para focar nos alertas
        },
    });

    // Configurar contexto
    const context = createWorkflowContext({
        correlationId: 'test-memory-leak-fix',
        tenantId: 'test-tenant',
    });

    // Configurar runtime com configurações otimizadas
    const runtime = createRuntime(context, observability, {
        queueSize: 100,
        batchSize: 10,
        enableObservability: true,
        memoryMonitor: {
            intervalMs: 5000, // 5s para teste rápido
            thresholds: {
                heapUsed: 50 * 1024 * 1024, // 50MB para teste
                rss: 100 * 1024 * 1024, // 100MB para teste
            },
            leakDetection: {
                enabled: true,
                samples: 3, // Menos amostras para teste rápido
                minGrowthMb: 5, // 5MB para teste
                sampleIntervalMs: 10000, // 10s para teste
            },
        },
        ackTimeout: 10000, // 10s para teste
        maxRetries: 1,
    });

    // Simular uso intensivo de memória
    console.log('📊 Simulando uso intensivo de memória...');

    const initialMemory = process.memoryUsage();
    console.log(
        `Heap inicial: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`,
    );

    // Emitir muitos eventos para testar o sistema
    const eventCount = 100;
    const promises = [];

    for (let i = 0; i < eventCount; i++) {
        promises.push(
            runtime.emit('test.event', {
                id: i,
                data: `test-data-${i}`,
                timestamp: Date.now(),
            }),
        );
    }

    await Promise.all(promises);
    console.log(`✅ Emitidos ${eventCount} eventos`);

    // Processar eventos
    console.log('🔄 Processando eventos...');
    await runtime.process();

    // Aguardar um pouco para ver os alertas de memória
    console.log('⏳ Aguardando 15s para monitorar memória...');
    await new Promise((resolve) => setTimeout(resolve, 15000));

    // Verificar memória final
    const finalMemory = process.memoryUsage();
    console.log(
        `Heap final: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`,
    );

    const growth = finalMemory.heapUsed - initialMemory.heapUsed;
    const growthMb = Math.round(growth / 1024 / 1024);

    console.log(`📈 Crescimento: ${growthMb}MB`);

    // Obter estatísticas
    const stats = runtime.getStats();
    console.log('\n📊 Estatísticas do Runtime:');
    console.log(`- Queue size: ${stats.queueSize || 0}`);
    console.log(`- Processed events: ${stats.processedEventsCount || 0}`);
    console.log(`- Max processed events: ${stats.maxProcessedEvents || 0}`);

    // Verificar se há memory leaks
    if (growthMb > 50) {
        console.log('❌ ALERTA: Possível memory leak detectado!');
        console.log(`   Crescimento de ${growthMb}MB é muito alto`);
    } else if (growthMb > 20) {
        console.log('⚠️  AVISO: Crescimento moderado de memória');
        console.log(`   Crescimento de ${growthMb}MB`);
    } else {
        console.log('✅ SUCESSO: Memory leak controlado');
        console.log(`   Crescimento de ${growthMb}MB está aceitável`);
    }

    // Cleanup
    runtime.clear();
    console.log('\n🧹 Cleanup realizado');

    // Verificar memória após cleanup
    const afterCleanupMemory = process.memoryUsage();
    const afterCleanupMb = Math.round(
        afterCleanupMemory.heapUsed / 1024 / 1024,
    );
    console.log(`Heap após cleanup: ${afterCleanupMb}MB`);

    const cleanupReduction = finalMemory.heapUsed - afterCleanupMemory.heapUsed;
    const cleanupReductionMb = Math.round(cleanupReduction / 1024 / 1024);

    if (cleanupReductionMb > 0) {
        console.log(`✅ Cleanup liberou ${cleanupReductionMb}MB`);
    } else {
        console.log('⚠️  Cleanup não liberou memória significativa');
    }

    console.log('\n🎯 Teste concluído!');
}

// Executar teste
testMemoryLeakFix().catch(console.error);
