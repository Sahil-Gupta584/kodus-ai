/**
 * Script para analisar os resultados dos testes de performance
 */

const fs = require('fs');
const path = require('path');

// Configurau00e7u00f5es
const CONFIG = {
  // Caminho para o arquivo de log do event loop
  eventLoopLogPath: path.join(__dirname, 'event-loop-lag.log'),
  // Caminho para o arquivo de resultados dos webhooks
  webhookResultsPath: path.join(__dirname, 'webhook-results.json'),
  // Caminho para o arquivo de sau00edda com as estatu00edsticas
  outputPath: path.join(__dirname, 'performance-results.txt'),
};

// Interface para os dados de lag do event loop
class EventLoopAnalyzer {
  constructor(logPath) {
    this.logPath = logPath;
    this.data = [];
  }

  loadData() {
    try {
      if (!fs.existsSync(this.logPath)) {
        console.error(`Arquivo de log nu00e3o encontrado: ${this.logPath}`);
        return false;
      }

      const logContent = fs.readFileSync(this.logPath, 'utf8');
      const lines = logContent.split('\n').filter(line => line.trim() !== '');
      
      // Pular o cabeu00e7alho
      const dataLines = lines.slice(1);
      
      this.data = dataLines.map(line => {
        const [timestamp, lag, isBlocked] = line.split(',');
        return {
          timestamp: parseInt(timestamp),
          lag: parseFloat(lag),
          isBlocked: parseInt(isBlocked) === 1,
        };
      });

      return true;
    } catch (error) {
      console.error('Erro ao carregar dados do event loop:', error);
      return false;
    }
  }

  analyze() {
    if (this.data.length === 0) {
      return {
        totalChecks: 0,
        blockedCount: 0,
        blockPercentage: 0,
        avgLag: 0,
        maxLag: 0,
        p95Lag: 0,
        p99Lag: 0,
        duration: 0,
        blockedPeriods: [],
      };
    }
    
    // Estatu00edsticas bu00e1sicas
    const totalChecks = this.data.length;
    const blockedData = this.data.filter(item => item.isBlocked);
    const blockedCount = blockedData.length;
    const blockPercentage = (blockedCount / totalChecks) * 100;
    
    // Calcular lags
    const lags = this.data.map(item => item.lag);
    const avgLag = lags.reduce((sum, lag) => sum + lag, 0) / totalChecks;
    const maxLag = Math.max(...lags);
    
    // Calcular percentis
    const sortedLags = [...lags].sort((a, b) => a - b);
    const p95Index = Math.floor(totalChecks * 0.95);
    const p99Index = Math.floor(totalChecks * 0.99);
    const p95Lag = sortedLags[p95Index];
    const p99Lag = sortedLags[p99Index];
    
    // Calcular durau00e7u00e3o do teste
    const startTime = this.data[0].timestamp;
    const endTime = this.data[this.data.length - 1].timestamp;
    const duration = (endTime - startTime) / 1000; // em segundos
    
    // Identificar peru00edodos de bloqueio
    const blockedPeriods = [];
    let blockStart = -1;
    
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i].isBlocked && blockStart === -1) {
        blockStart = this.data[i].timestamp;
      } else if (!this.data[i].isBlocked && blockStart !== -1) {
        blockedPeriods.push({
          start: blockStart,
          end: this.data[i-1].timestamp,
          duration: (this.data[i-1].timestamp - blockStart) / 1000, // em segundos
        });
        blockStart = -1;
      }
    }
    
    // Se o u00faltimo ponto for um bloqueio, fechar o peru00edodo
    if (blockStart !== -1) {
      blockedPeriods.push({
        start: blockStart,
        end: this.data[this.data.length - 1].timestamp,
        duration: (this.data[this.data.length - 1].timestamp - blockStart) / 1000, // em segundos
      });
    }
    
    return {
      totalChecks,
      blockedCount,
      blockPercentage,
      avgLag,
      maxLag,
      p95Lag,
      p99Lag,
      duration,
      blockedPeriods,
    };
  }
}

class WebhookResultAnalyzer {
  constructor(resultsPath) {
    this.resultsPath = resultsPath;
    this.data = null;
  }

  loadData() {
    try {
      if (!fs.existsSync(this.resultsPath)) {
        console.error(`Arquivo de resultados nu00e3o encontrado: ${this.resultsPath}`);
        return false;
      }

      const resultsContent = fs.readFileSync(this.resultsPath, 'utf8');
      this.data = JSON.parse(resultsContent);
      return true;
    } catch (error) {
      console.error('Erro ao carregar resultados dos webhooks:', error);
      return false;
    }
  }

  analyze() {
    if (!this.data) {
      return {
        totalWebhooks: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgDuration: 0,
        maxDuration: 0,
        minDuration: 0,
        p95Duration: 0,
        totalDuration: 0,
        throughput: 0,
      };
    }

    const { results, summary } = this.data;
    
    // Extrair durau00e7u00f5es
    const durations = results.map(r => r.duration);
    const successDurations = results.filter(r => r.success).map(r => r.duration);
    
    // Calcular estatu00edsticas
    const totalWebhooks = results.length;
    const successCount = results.filter(r => r.success).length;
    const failureCount = totalWebhooks - successCount;
    const successRate = (successCount / totalWebhooks) * 100;
    
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / totalWebhooks;
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);
    
    // Calcular percentis
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const p95Index = Math.floor(totalWebhooks * 0.95);
    const p95Duration = sortedDurations[p95Index];
    
    // Calcular throughput (requisiu00e7u00f5es por segundo)
    const totalDuration = summary.totalDuration / 1000; // em segundos
    const throughput = totalWebhooks / totalDuration;
    
    return {
      totalWebhooks,
      successCount,
      failureCount,
      successRate,
      avgDuration,
      maxDuration,
      minDuration,
      p95Duration,
      totalDuration,
      throughput,
    };
  }
}

function generateReport(eventLoopStats, webhookStats) {
  const report = [];
  
  // Cabeu00e7alho
  report.push('=== RELATu00d3RIO DE PERFORMANCE ===');
  report.push(`Data: ${new Date().toISOString()}`);
  report.push('\n');
  
  // Estatu00edsticas do Event Loop
  report.push('--- ESTATu00cdSTICAS DO EVENT LOOP ---');
  if (eventLoopStats.totalChecks > 0) {
    report.push(`Total de verificau00e7u00f5es: ${eventLoopStats.totalChecks}`);
    report.push(`Durau00e7u00e3o do monitoramento: ${eventLoopStats.duration.toFixed(2)} segundos`);
    report.push(`Bloqueios detectados: ${eventLoopStats.blockedCount} (${eventLoopStats.blockPercentage.toFixed(2)}%)`);
    report.push(`Lag mu00e9dio: ${eventLoopStats.avgLag.toFixed(2)}ms`);
    report.push(`Lag mu00e1ximo: ${eventLoopStats.maxLag.toFixed(2)}ms`);
    report.push(`Lag P95: ${eventLoopStats.p95Lag.toFixed(2)}ms`);
    report.push(`Lag P99: ${eventLoopStats.p99Lag.toFixed(2)}ms`);
    
    // Peru00edodos de bloqueio
    if (eventLoopStats.blockedPeriods.length > 0) {
      report.push('\nPeru00edodos de bloqueio significativos:');
      eventLoopStats.blockedPeriods
        .filter(period => period.duration >= 0.5) // Filtrar bloqueios de pelo menos 0.5 segundos
        .forEach((period, index) => {
          report.push(`  Bloqueio #${index + 1}:`);
          report.push(`  - Inu00edcio: ${new Date(period.start).toISOString()}`);
          report.push(`  - Fim: ${new Date(period.end).toISOString()}`);
          report.push(`  - Durau00e7u00e3o: ${period.duration.toFixed(2)} segundos`);
        });
    }
  } else {
    report.push('Nenhum dado do event loop disponu00edvel.');
  }
  report.push('\n');
  
  // Estatu00edsticas dos Webhooks
  report.push('--- ESTATu00cdSTICAS DOS WEBHOOKS ---');
  if (webhookStats.totalWebhooks > 0) {
    report.push(`Total de webhooks: ${webhookStats.totalWebhooks}`);
    report.push(`Webhooks com sucesso: ${webhookStats.successCount} (${webhookStats.successRate.toFixed(2)}%)`);
    report.push(`Webhooks com falha: ${webhookStats.failureCount}`);
    report.push(`Durau00e7u00e3o mu00e9dia: ${webhookStats.avgDuration.toFixed(2)}ms`);
    report.push(`Durau00e7u00e3o mu00ednima: ${webhookStats.minDuration.toFixed(2)}ms`);
    report.push(`Durau00e7u00e3o mu00e1xima: ${webhookStats.maxDuration.toFixed(2)}ms`);
    report.push(`Durau00e7u00e3o P95: ${webhookStats.p95Duration.toFixed(2)}ms`);
    report.push(`Throughput: ${webhookStats.throughput.toFixed(2)} webhooks/segundo`);
  } else {
    report.push('Nenhum dado de webhook disponu00edvel.');
  }
  report.push('\n');
  
  // Anu00e1lise e recomendau00e7u00f5es
  report.push('--- ANu00c1LISE E RECOMENDAu00c7u00d5ES ---');
  
  // Anu00e1lise do event loop
  if (eventLoopStats.totalChecks > 0) {
    if (eventLoopStats.blockPercentage > 10) {
      report.push('ALERTA: O event loop estu00e1 sendo bloqueado com frequu00eancia!');
      report.push(`${eventLoopStats.blockPercentage.toFixed(2)}% das verificau00e7u00f5es detectaram bloqueios.`);
      report.push('Recomendau00e7u00f5es:');
      report.push('1. Mova operau00e7u00f5es intensivas para workers');
      report.push('2. Utilize processamento assu00edncrono para tarefas pesadas');
      report.push('3. Implemente um sistema de filas para webhooks');
    } else if (eventLoopStats.maxLag > 500) {
      report.push('ATENu00c7u00c3O: Foram detectados bloqueios ocasionais do event loop.');
      report.push(`Lag mu00e1ximo detectado: ${eventLoopStats.maxLag.toFixed(2)}ms`);
      report.push('Recomendau00e7u00f5es:');
      report.push('1. Identifique as operau00e7u00f5es que causam os picos de lag');
      report.push('2. Considere otimizar as chamadas ao MongoDB e APIs externas');
    } else {
      report.push('O event loop estu00e1 funcionando bem, sem bloqueios significativos.');
    }
  }
  
  // Anu00e1lise dos webhooks
  if (webhookStats.totalWebhooks > 0) {
    if (webhookStats.successRate < 95) {
      report.push('\nALERTA: Taxa de sucesso dos webhooks abaixo do esperado!');
      report.push(`Apenas ${webhookStats.successRate.toFixed(2)}% dos webhooks foram processados com sucesso.`);
      report.push('Recomendau00e7u00f5es:');
      report.push('1. Verifique os logs de erro para identificar as falhas');
      report.push('2. Implemente mecanismos de retry para webhooks falhos');
    }
    
    if (webhookStats.avgDuration > 1000) {
      report.push('\nATENu00c7u00c3O: Tempo de resposta dos webhooks estu00e1 alto.');
      report.push(`Tempo mu00e9dio de resposta: ${webhookStats.avgDuration.toFixed(2)}ms`);
      report.push('Recomendau00e7u00f5es:');
      report.push('1. Responda aos webhooks imediatamente e processe em background');
      report.push('2. Otimize as consultas ao banco de dados');
    }
    
    // Capacidade estimada
    const estimatedCapacity = Math.floor(60 / (webhookStats.avgDuration / 1000));
    report.push('\nCapacidade estimada:');
    report.push(`Baseado nos testes, o sistema suporta aproximadamente ${estimatedCapacity} webhooks por minuto`);
    report.push(`com um tempo mu00e9dio de resposta de ${webhookStats.avgDuration.toFixed(2)}ms.`);
  }
  
  return report.join('\n');
}

// Funu00e7u00e3o principal
async function analyzeResults() {
  console.log('Analisando resultados dos testes de performance...');
  
  // Analisar dados do event loop
  const eventLoopAnalyzer = new EventLoopAnalyzer(CONFIG.eventLoopLogPath);
  let eventLoopStats = { totalChecks: 0 };
  
  if (eventLoopAnalyzer.loadData()) {
    eventLoopStats = eventLoopAnalyzer.analyze();
    console.log('Dados do event loop analisados com sucesso.');
  }
  
  // Analisar resultados dos webhooks
  const webhookAnalyzer = new WebhookResultAnalyzer(CONFIG.webhookResultsPath);
  let webhookStats = { totalWebhooks: 0 };
  
  if (webhookAnalyzer.loadData()) {
    webhookStats = webhookAnalyzer.analyze();
    console.log('Dados dos webhooks analisados com sucesso.');
  }
  
  // Gerar relatu00f3rio
  const report = generateReport(eventLoopStats, webhookStats);
  
  // Salvar relatu00f3rio
  fs.writeFileSync(CONFIG.outputPath, report);
  console.log(`Relatu00f3rio salvo em: ${CONFIG.outputPath}`);
  
  // Exibir resumo
  console.log('\nResumo da anu00e1lise:');
  if (eventLoopStats.totalChecks > 0) {
    console.log(`- Bloqueios do event loop: ${eventLoopStats.blockedCount} (${eventLoopStats.blockPercentage.toFixed(2)}%)`);
    console.log(`- Lag mu00e1ximo: ${eventLoopStats.maxLag.toFixed(2)}ms`);
  }
  
  if (webhookStats.totalWebhooks > 0) {
    console.log(`- Webhooks processados: ${webhookStats.successCount}/${webhookStats.totalWebhooks} (${webhookStats.successRate.toFixed(2)}%)`);
    console.log(`- Tempo mu00e9dio de resposta: ${webhookStats.avgDuration.toFixed(2)}ms`);
    console.log(`- Throughput: ${webhookStats.throughput.toFixed(2)} webhooks/segundo`);
  }
}

// Executar a anu00e1lise
analyzeResults();
