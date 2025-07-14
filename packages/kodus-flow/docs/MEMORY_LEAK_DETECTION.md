# 🔍 Sistema de Detecção de Memory Leaks

O Kodus Flow possui um sistema robusto e integrado de detecção e prevenção de memory leaks que monitora continuamente o uso de memória, detecta vazamentos automaticamente e fornece alertas em tempo real.

## 🚀 Características Principais

### ✅ **Detecção Automática**
- Monitoramento contínuo do uso de memória
- Detecção de crescimento anormal de heap
- Tracking de recursos (timers, event listeners, promises)
- Análise de padrões de memory leaks

### ✅ **Alertas Inteligentes**
- Alertas automáticos quando thresholds são excedidos
- Classificação por severidade (warning, error, critical)
- Recomendações de ações corretivas
- Integração com sistema de observabilidade

### ✅ **Limpeza Automática**
- Limpeza automática de recursos antigos
- Garbage collection forçada quando necessário
- Timeout para callbacks de cleanup
- Tracking de recursos dispostos

### ✅ **Métricas em Tempo Real**
- Uso de heap, RSS, external memory
- Contagem de timers, listeners, promises
- Histórico de métricas com timeline
- Cálculo de risk level automático

## 🛠️ Configuração

### Setup Básico

```typescript
import { getIntegratedObservability } from '@kodus/flow/observability';

// Inicializar sistema integrado (inclui detector de memory leak)
const observability = getIntegratedObservability();
await observability.initialize();

// Acessar detector de memory leak
const detector = observability.getMemoryLeakDetector();
```

### Configuração Avançada

```typescript
import { 
    MemoryLeakDetector, 
    type MemoryLeakDetectorConfig 
} from '@kodus/flow/observability';

const config: MemoryLeakDetectorConfig = {
    // Intervalo de monitoramento
    monitoringInterval: 30000, // 30 segundos
    
    // Thresholds de detecção
    thresholds: {
        memoryGrowthMb: 50,          // 50MB de crescimento
        maxActiveTimers: 100,         // 100 timers ativos
        maxPendingPromises: 500,      // 500 promises pendentes
        maxHeapUsagePercent: 0.9,     // 90% do heap
        maxVectorStoreMb: 100,        // 100MB no VectorStore
        maxMemoryManagerMb: 200,      // 200MB no MemoryManager
    },
    
    // Limpeza automática
    autoCleanup: {
        enabled: true,
        maxResourceAge: 300000,       // 5 minutos
        cleanupInterval: 60000,       // 1 minuto
        forceGC: true,                // Força GC em produção
    },
    
    // Configuração de alertas
    alerts: {
        enabled: true,
        logLevel: 'warn',
        onAlert: (alert) => {
            console.log(`Memory leak alert: ${alert.message}`);
        },
    },
    
    // Recursos a serem monitorados
    features: {
        trackEventListeners: true,
        trackTimers: true,
        trackPromises: true,
        trackMemoryManager: true,
        trackVectorStore: true,
        trackEventBus: true,
    },
};

const detector = new MemoryLeakDetector(observabilitySystem, config);
detector.start();
```

## 📊 Monitoramento

### Métricas Disponíveis

```typescript
const metrics = detector.getCurrentMetrics();

console.log('Memory Usage:', {
    heapUsedMb: metrics.memoryUsage.heapUsedMb,
    heapTotalMb: metrics.memoryUsage.heapTotalMb,
    heapUsagePercent: metrics.memoryUsage.heapUsagePercent,
    rssMb: metrics.memoryUsage.rssMb,
    externalMb: metrics.memoryUsage.externalMb,
});

console.log('Resource Counts:', {
    eventListeners: metrics.resourceCounts.eventListeners,
    activeTimers: metrics.resourceCounts.activeTimers,
    pendingPromises: metrics.resourceCounts.pendingPromises,
    memoryManagerItems: metrics.resourceCounts.memoryManagerItems,
    vectorStoreItems: metrics.resourceCounts.vectorStoreItems,
});

console.log('Risk Level:', metrics.riskLevel); // 'low', 'medium', 'high', 'critical'
```

### Histórico de Métricas

```typescript
// Obter histórico completo
const history = detector.getMetricsHistory();

// Obter apenas últimas 20 medições
const recent = detector.getMetricsHistory(20);

// Analisar tendências
const memoryTrend = recent.map(m => m.memoryUsage.heapUsedMb);
const isGrowing = memoryTrend[memoryTrend.length - 1] > memoryTrend[0];
```

## 🚨 Sistema de Alertas

### Tipos de Alertas

```typescript
type AlertType = 
    | 'MEMORY_GROWTH'    // Crescimento excessivo de memória
    | 'LISTENER_LEAK'    // Vazamento de event listeners
    | 'TIMER_LEAK'       // Vazamento de timers
    | 'PROMISE_LEAK'     // Vazamento de promises
    | 'RESOURCE_LEAK'    // Vazamento de recursos gerais
    | 'HEAP_OVERFLOW';   // Heap usage muito alto
```

### Tratamento de Alertas

```typescript
detector.on('alert', (alert) => {
    console.log(`🚨 Alert: ${alert.type}`);
    console.log(`Severity: ${alert.severity}`);
    console.log(`Message: ${alert.message}`);
    console.log(`Recommended Action: ${alert.recommendedAction}`);
    
    // Ações baseadas no tipo de alerta
    switch (alert.type) {
        case 'MEMORY_GROWTH':
            handleMemoryGrowth(alert);
            break;
        case 'TIMER_LEAK':
            handleTimerLeak(alert);
            break;
        case 'PROMISE_LEAK':
            handlePromiseLeak(alert);
            break;
        // ...
    }
});

function handleMemoryGrowth(alert) {
    // Implementar ações específicas para crescimento de memória
    if (alert.severity === 'critical') {
        // Ações de emergência
        detector.forceCleanup();
        if (global.gc) global.gc();
    }
}
```

## 🔧 Debugging e Análise

### Recursos Trackeados

```typescript
// Obter todos os recursos sendo trackeados
const resources = detector.getTrackedResources();

// Filtrar por tipo
const timers = resources.filter(r => r.type === 'timer');
const listeners = resources.filter(r => r.type === 'listener');
const promises = resources.filter(r => r.type === 'promise');

// Analisar recursos antigos
const oldResources = resources.filter(r => 
    Date.now() - r.createdAt > 300000 // 5 minutos
);

console.log('Old resources:', oldResources.length);
```

### Análise de Alertas

```typescript
// Obter alertas recentes
const alerts = detector.getRecentAlerts(10);

// Analisar padrões
const criticalAlerts = alerts.filter(a => a.severity === 'critical');
const memoryAlerts = alerts.filter(a => a.type === 'MEMORY_GROWTH');

// Trending de alertas
const alertsByHour = alerts.reduce((acc, alert) => {
    const hour = new Date(alert.timestamp).getHours();
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
}, {});
```

## 🏥 Health Checks

### Verificação de Saúde

```typescript
// Via sistema integrado
const health = observability.getHealthStatus();
const memoryHealth = health.components.memoryLeakDetector;

console.log('Memory Leak Detector Health:', {
    healthy: memoryHealth.healthy,
    issues: memoryHealth.issues,
});

// Verificação manual
const stats = detector.getStats();
console.log('Detector Stats:', {
    isRunning: stats.isRunning,
    metricsCount: stats.metricsCount,
    alertsCount: stats.alertsCount,
    trackedResourcesCount: stats.trackedResourcesCount,
});
```

### Métricas de Performance

```typescript
// Verificar performance do próprio detector
const metrics = detector.getCurrentMetrics();

if (metrics.riskLevel === 'high' || metrics.riskLevel === 'critical') {
    console.warn('🚨 High memory leak risk detected!');
    
    // Ações recomendadas
    detector.forceCleanup();
    
    // Analisar componentes específicos
    const memoryManager = observability.getMemoryManager();
    const memoryStats = memoryManager.getStats();
    
    if (memoryStats.totalMemoryUsage > 100 * 1024 * 1024) { // 100MB
        console.warn('Memory Manager is using too much memory');
        // Considerar clear de itens antigos
    }
}
```

## 🔄 Integração com Outros Sistemas

### Event Bus

```typescript
// Subscribir para eventos de memory leak
observability.subscribeToEvent('system.memory.leak.detected', (event) => {
    const alert = event.data;
    
    // Integrar com sistema de notificações
    notificationService.sendAlert({
        title: 'Memory Leak Detected',
        message: alert.message,
        severity: alert.severity,
    });
});
```

### Logging

```typescript
// Logs automáticos já são integrados, mas você pode adicionar custom logs
detector.on('metrics', (metrics) => {
    if (metrics.riskLevel === 'high') {
        observability.getLogger().warn('High memory usage detected', {
            component: 'memory-leak-detector',
            heapUsedMb: metrics.memoryUsage.heapUsedMb,
            heapUsagePercent: metrics.memoryUsage.heapUsagePercent,
            activeTimers: metrics.resourceCounts.activeTimers,
        });
    }
});
```

## 🎯 Configurações por Ambiente

### Desenvolvimento

```typescript
const devConfig = {
    monitoringInterval: 15000,        // 15 segundos
    thresholds: {
        memoryGrowthMb: 25,
        maxHeapUsagePercent: 0.7,     // 70%
        maxActiveTimers: 50,
    },
    autoCleanup: {
        enabled: true,
        maxResourceAge: 180000,       // 3 minutos
        cleanupInterval: 30000,       // 30 segundos
        forceGC: false,
    },
    alerts: {
        enabled: true,
        logLevel: 'warn',
    },
};
```

### Produção

```typescript
const prodConfig = {
    monitoringInterval: 60000,        // 1 minuto
    thresholds: {
        memoryGrowthMb: 100,
        maxHeapUsagePercent: 0.85,    // 85%
        maxActiveTimers: 200,
        maxPendingPromises: 1000,
    },
    autoCleanup: {
        enabled: true,
        maxResourceAge: 600000,       // 10 minutos
        cleanupInterval: 120000,      // 2 minutos
        forceGC: true,
    },
    alerts: {
        enabled: true,
        logLevel: 'error',
        onAlert: (alert) => {
            // Integrar com sistema de monitoramento (ex: Datadog, New Relic)
            monitoringService.sendAlert(alert);
        },
    },
};
```

## 🐛 Troubleshooting

### Problemas Comuns

#### 1. **Detector não inicia**
```typescript
// Verificar se o sistema de observabilidade foi inicializado
const observability = getIntegratedObservability();
if (!observability.initialized) {
    await observability.initialize();
}

// Verificar se existe detector
const detector = observability.getMemoryLeakDetector();
if (!detector) {
    console.error('Memory leak detector not available');
}
```

#### 2. **Muitos alertas falsos**
```typescript
// Ajustar thresholds
detector.updateConfig({
    thresholds: {
        memoryGrowthMb: 100,      // Aumentar threshold
        maxActiveTimers: 200,     // Aumentar limite
    },
});
```

#### 3. **Performance degradada**
```typescript
// Reduzir frequência de monitoramento
detector.updateConfig({
    monitoringInterval: 60000,    // 1 minuto
    autoCleanup: {
        cleanupInterval: 300000,  // 5 minutos
    },
});
```

#### 4. **Memory leak não detectado**
```typescript
// Força uma verificação manual
const metrics = detector.forceCheck();
console.log('Current metrics:', metrics);

// Verificar se features estão habilitadas
detector.updateConfig({
    features: {
        trackEventListeners: true,
        trackTimers: true,
        trackPromises: true,
        trackMemoryManager: true,
    },
});
```

## 📈 Melhores Práticas

### 1. **Configuração Apropriada**
- Use configurações diferentes para dev/prod
- Ajuste thresholds baseado no seu ambiente
- Habilite apenas features necessárias

### 2. **Monitoramento Proativo**
- Configure alertas para notificações externas
- Monitore trends de uso de memória
- Implemente ações automáticas para alertas críticos

### 3. **Integração com CI/CD**
- Adicione verificações de memory leak nos testes
- Configure alertas para builds com alto uso de memória
- Monitore métricas de performance em staging

### 4. **Cleanup Regular**
- Implemente cleanup manual quando necessário
- Use resource managers para recursos críticos
- Monitore recursos de longa duração

## 🔧 API Reference

### MemoryLeakDetector

```typescript
class MemoryLeakDetector {
    // Lifecycle
    start(): void
    stop(): void
    shutdown(): Promise<void>
    
    // Metrics
    getCurrentMetrics(): MemoryLeakMetrics
    getMetricsHistory(limit?: number): MemoryLeakMetrics[]
    
    // Alerts
    getRecentAlerts(limit?: number): MemoryLeakAlert[]
    
    // Resources
    getTrackedResources(): TrackedResource[]
    
    // Control
    forceCheck(): MemoryLeakMetrics
    forceCleanup(): void
    
    // Configuration
    updateConfig(config: Partial<MemoryLeakDetectorConfig>): void
    getStats(): DetectorStats
    
    // Events
    on(event: 'alert', listener: (alert: MemoryLeakAlert) => void): void
    on(event: 'metrics', listener: (metrics: MemoryLeakMetrics) => void): void
}
```

### Interfaces Principais

```typescript
interface MemoryLeakMetrics {
    timestamp: number;
    memoryUsage: {
        heapUsed: number;
        heapTotal: number;
        rss: number;
        external: number;
        heapUsedMb: number;
        heapTotalMb: number;
        rssMb: number;
        externalMb: number;
        heapUsagePercent: number;
    };
    resourceCounts: {
        eventListeners: number;
        activeTimers: number;
        pendingPromises: number;
        memoryManagerItems: number;
        vectorStoreItems: number;
        eventBusListeners: number;
    };
    growth: {
        memoryGrowthMb: number;
        listenerGrowth: number;
        timerGrowth: number;
        promiseGrowth: number;
    };
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface MemoryLeakAlert {
    id: string;
    type: 'MEMORY_GROWTH' | 'LISTENER_LEAK' | 'TIMER_LEAK' | 'PROMISE_LEAK' | 'RESOURCE_LEAK' | 'HEAP_OVERFLOW';
    severity: 'warning' | 'error' | 'critical';
    message: string;
    timestamp: number;
    metrics: MemoryLeakMetrics;
    source: string;
    details: Record<string, unknown>;
    recommendedAction?: string;
}
```

## 📚 Exemplos Completos

### Exemplo 1: Setup Básico

```typescript
import { setupIntegratedObservability } from '@kodus/flow/observability';

async function main() {
    // Setup integrado
    const obs = await setupIntegratedObservability('production');
    
    // Verificar detector
    const detector = obs.getMemoryLeakDetector();
    if (detector) {
        console.log('✅ Memory leak detector initialized');
        
        // Verificar métricas iniciais
        const metrics = detector.getCurrentMetrics();
        console.log('Initial memory usage:', metrics.memoryUsage.heapUsedMb, 'MB');
    }
}
```

### Exemplo 2: Monitoramento Customizado

```typescript
import { MemoryLeakDetector } from '@kodus/flow/observability';

class CustomMemoryMonitor {
    private detector: MemoryLeakDetector;
    private alertHistory: MemoryLeakAlert[] = [];
    
    constructor(observabilitySystem) {
        this.detector = new MemoryLeakDetector(observabilitySystem, {
            monitoringInterval: 30000,
            alerts: {
                enabled: true,
                onAlert: (alert) => this.handleAlert(alert),
            },
        });
    }
    
    start() {
        this.detector.start();
        
        // Monitoramento customizado
        setInterval(() => {
            this.checkMemoryTrends();
        }, 60000);
    }
    
    private handleAlert(alert: MemoryLeakAlert) {
        this.alertHistory.push(alert);
        
        // Ações baseadas no tipo
        switch (alert.type) {
            case 'MEMORY_GROWTH':
                this.handleMemoryGrowth(alert);
                break;
            case 'HEAP_OVERFLOW':
                this.handleHeapOverflow(alert);
                break;
        }
    }
    
    private checkMemoryTrends() {
        const history = this.detector.getMetricsHistory(10);
        const memoryTrend = history.map(m => m.memoryUsage.heapUsedMb);
        
        const isIncreasing = memoryTrend.every((val, i) => 
            i === 0 || val >= memoryTrend[i - 1]
        );
        
        if (isIncreasing && memoryTrend.length >= 5) {
            console.warn('🚨 Sustained memory growth detected');
            this.detector.forceCleanup();
        }
    }
}
```

Este sistema de detecção de memory leaks fornece uma base sólida para monitoramento proativo de memória em aplicações Node.js, integrando-se perfeitamente com o ecossistema de observabilidade do Kodus Flow.