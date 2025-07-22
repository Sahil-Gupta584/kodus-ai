/**
 * Script de Teste para Debugging
 *
 * Para testar se o debugging está funcionando:
 * 1. Coloque um breakpoint na linha 15 (const result = x + y;)
 * 2. Use F5 para iniciar debug
 * 3. Verifique se o breakpoint é atingido
 */

console.log('🚀 Teste de debugging iniciado');

function testFunction() {
    const x = 10;
    const y = 20;
    const result = x + y; // ← Coloque breakpoint aqui
    console.log('Resultado:', result);
    return result;
}

testFunction();
console.log('✅ Teste concluído');
