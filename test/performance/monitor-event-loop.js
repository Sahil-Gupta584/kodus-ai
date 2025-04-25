/**
 * Script para monitorar o event loop durante testes de performance
 */

const fs = require('fs');
const path = require('path');

// Configurações
const CONFIG = {
    // Intervalo de verificação do event loop em ms
    checkInterval: 100,
    // Limite de atraso do event loop considerado como bloqueio (em ms)
    blockThreshold: 100,
    // Duração total do monitoramento em ms (0 para executar indefinidamente)
    duration: 0,
    // Caminho para o arquivo de log
    logPath: path.join(__dirname, 'event-loop-lag.log'),
    // Se deve exibir todos os registros ou apenas os bloqueios
    logOnlyBlocks: true,
};

// Classe para monitorar o event loop
class EventLoopMonitor {
    constructor() {
        this.startTime = Date.now();
        this.lastCheckTime = this.startTime;
        this.maxLag = 0;
        this.totalChecks = 0;
        this.blockedChecks = 0;

        // Cria o arquivo de log
        this.logStream = fs.createWriteStream(CONFIG.logPath, { flags: 'w' });
        this.logStream.write('timestamp,lag_ms,is_blocked\n');

        this.intervalId = null;
    }

    // Inicia o monitoramento
    start() {
        console.log('Iniciando monitoramento do event loop...');
        console.log(`Intervalo de verificação: ${CONFIG.checkInterval}ms`);
        console.log(`Limite para bloqueio: ${CONFIG.blockThreshold}ms`);
        console.log(`Arquivo de log: ${CONFIG.logPath}`);
        console.log('-----------------------------------------------');

        // Configura o intervalo para verificar o event loop
        this.intervalId = setInterval(
            () => this.checkEventLoop(),
            CONFIG.checkInterval,
        );

        // Configura o timeout se a duração for especificada
        if (CONFIG.duration > 0) {
            setTimeout(() => this.stop(), CONFIG.duration);
        }

        // Registra eventos de encerramento
        process.on('SIGINT', () => this.stop());
        process.on('SIGTERM', () => this.stop());
    }

    // Para o monitoramento
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;

            const totalDuration = Date.now() - this.startTime;
            const avgLag =
                this.totalChecks > 0 ? this.maxLag / this.totalChecks : 0;
            const blockPercentage =
                this.totalChecks > 0
                    ? (this.blockedChecks / this.totalChecks) * 100
                    : 0;

            console.log('-----------------------------------------------');
            console.log(
                `Monitoramento finalizado após ${totalDuration / 1000} segundos`,
            );
            console.log(`Total de verificações: ${this.totalChecks}`);
            console.log(`Atraso máximo detectado: ${this.maxLag.toFixed(2)}ms`);
            console.log(
                `Bloqueios detectados: ${this.blockedChecks} (${blockPercentage.toFixed(2)}%)`,
            );
            console.log(`Detalhes salvos em: ${CONFIG.logPath}`);

            this.logStream.end();
            process.exit(0);
        }
    }

    // Verifica o atraso do event loop
    checkEventLoop() {
        const expectedTime = this.lastCheckTime + CONFIG.checkInterval;
        const currentTime = Date.now();
        const lag = currentTime - expectedTime;

        // Atualiza o último tempo de verificação
        this.lastCheckTime = currentTime;

        // Registra as estatísticas
        this.totalChecks++;
        this.maxLag = Math.max(this.maxLag, lag);

        // Verifica se o event loop está bloqueado
        const isBlocked = lag >= CONFIG.blockThreshold;
        if (isBlocked) {
            this.blockedChecks++;
            console.log(
                `[${new Date().toISOString()}] Bloqueio detectado: ${lag.toFixed(2)}ms`,
            );
        } else if (!CONFIG.logOnlyBlocks) {
            console.log(
                `[${new Date().toISOString()}] Lag: ${lag.toFixed(2)}ms`,
            );
        }

        // Registra no arquivo de log
        this.logStream.write(
            `${currentTime},${lag.toFixed(2)},${isBlocked ? 1 : 0}\n`,
        );
    }
}

// Cria e inicia o monitor
const monitor = new EventLoopMonitor();
monitor.start();
