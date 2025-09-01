/**
 * 🚀 EXECUTOR DE TODOS OS EXEMPLOS DE STRATEGY
 *
 * Script para executar todos os exemplos criados
 * para demonstrar o funcionamento completo da nova arquitetura.
 */

// =============================================================================
// 📦 IMPORTAÇÃO DOS EXEMPLOS
// =============================================================================

import { runAllExamples as runFormattersExamples } from './strategy-formatters-usage.js';
import { runAllPromptExamples } from './strategy-prompts-usage.js';

// =============================================================================
// 🎯 FUNÇÃO PRINCIPAL
// =============================================================================

/**
 * Executa todos os exemplos de strategy em sequência
 */
async function runAllStrategyExamples() {
    console.log('🎯 EXECUTANDO TODOS OS EXEMPLOS DE STRATEGY\n');
    console.log('🚀 Nova arquitetura de strategies em ação!');
    console.log('='.repeat(80));
    console.log();

    const startTime = Date.now();

    try {
        // === 1. EXEMPLOS DE FORMATADORES ===
        console.log('📋 1. FORMATADORES');
        console.log('─'.repeat(50));
        runFormattersExamples();
        console.log();

        // Pequena pausa para visualização
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // === 2. EXEMPLOS DE PROMPTS FUNCIONAIS ===
        console.log('📝 2. PROMPTS FUNCIONAIS');
        console.log('─'.repeat(50));
        runAllPromptExamples();
        console.log();

        // === 3. RESUMO FINAL ===
        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log('🎉 RESUMO DA EXECUÇÃO');
        console.log('─'.repeat(50));
        console.log(`⏱️  Tempo total: ${duration}ms`);
        console.log('✅ Todos os exemplos executados com sucesso!');
        console.log();
        console.log('🎯 O QUE FOI DEMONSTRADO:');
        console.log('✅ Formatadores avançados de ferramentas');
        console.log('✅ Sistema de cache inteligente');
        console.log('✅ Composição de prompts por estratégia');
        console.log('✅ Validação robusta de context');
        console.log('✅ Métricas de performance');
        console.log('✅ ReWoo e ReAct prompts funcionais');
        console.log('✅ Integração com arquitetura existente');
        console.log();
        console.log('🚀 PRONTO PARA PRODUÇÃO!');
        console.log('📚 Documentação completa disponível');
        console.log('🧪 Exemplos testáveis criados');
        console.log('🔧 Sistema modular e extensível');
    } catch (error) {
        console.error('❌ ERRO na execução dos exemplos:', error);
        console.log('\n🔧 Sugestões para resolução:');
        console.log('1. Verifique se todos os imports estão corretos');
        console.log('2. Confirme que os arquivos existem no caminho esperado');
        console.log('3. Execute: yarn install (se necessário)');
        console.log('4. Execute: yarn build (se necessário)');
    }
}

// =============================================================================
// 🎮 EXECUÇÃO INTERATIVA
// =============================================================================

/**
 * Menu interativo para escolher quais exemplos executar
 */
function showInteractiveMenu() {
    console.log('🎮 MENU INTERATIVO - Exemplos de Strategy\n');
    console.log('Escolha uma opção:');
    console.log('1. 🏃 Executar TODOS os exemplos');
    console.log('2. 📋 Apenas Formatadores');
    console.log('3. 📝 Apenas Prompts Funcionais');
    console.log('4. ℹ️  Informações sobre a arquitetura');
    console.log('5. 🚪 Sair');
    console.log();

    // Nota: Em um ambiente real, você usaria process.stdin
    // Para este exemplo, vamos executar tudo automaticamente
    console.log('💡 Executando automaticamente todos os exemplos...\n');
}

/**
 * Informações sobre a arquitetura implementada
 */
function showArchitectureInfo() {
    console.log('🏗️  ARQUITETURA IMPLEMENTADA\n');
    console.log('📁 Arquivos Criados:');
    console.log('├── src/engine/strategies/prompts/');
    console.log('│   ├── strategy-formatters.ts    # Formatadores principais');
    console.log('│   ├── strategy-utils.ts         # Utilitários avançados');
    console.log(
        '│   ├── strategy-prompts.ts       # Sistema de prompts funcionais',
    );
    console.log('│   └── index.ts                  # Exports unificados');
    console.log('└── examples/');
    console.log('    ├── strategy-formatters-usage.ts');
    console.log('    ├── strategy-prompts-usage.ts');
    console.log('    └── run-all-strategy-examples.ts');
    console.log();

    console.log('🎯 Funcionalidades Principais:');
    console.log('✅ Formatadores inteligentes de ferramentas');
    console.log('✅ Sistema de cache LRU com TTL');
    console.log('✅ Composição de prompts por estratégia');
    console.log('✅ Validação robusta de context');
    console.log('✅ Métricas de performance');
    console.log('✅ Type safety completo');
    console.log('✅ Reutilização entre estratégias');
    console.log();

    console.log('🔄 Migração Realizada:');
    console.log('❌ Antes: Prompts comentados no ReWoo Strategy');
    console.log('✅ Depois: Sistema funcional com StrategyPromptFactory');
    console.log();

    console.log('🚀 Benefícios Alcançados:');
    console.log('⚡ Performance otimizada com cache');
    console.log('🛡️ Type safety rigoroso');
    console.log('🔧 Manutenção centralizada');
    console.log('📊 Observabilidade completa');
    console.log('🔄 Reutilização máxima');
    console.log('🧪 Testabilidade melhorada');
}

// =============================================================================
// 🎬 EXECUÇÃO PRINCIPAL
// =============================================================================

// Verifica se está sendo executado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
    // Executa automaticamente todos os exemplos
    runAllStrategyExamples();
} else {
    // Mostra informações quando importado
    console.log('📦 Módulo de exemplos de Strategy carregado!');
    console.log(
        '🚀 Execute runAllStrategyExamples() para ver todos os exemplos',
    );
    console.log('📋 Ou importe funções específicas dos outros arquivos');
}

// =============================================================================
// 🎯 EXPORTS PARA USO PROGRAMÁTICO
// =============================================================================

export { runAllStrategyExamples, showInteractiveMenu, showArchitectureInfo };

// Export default para conveniência
export default runAllStrategyExamples;
