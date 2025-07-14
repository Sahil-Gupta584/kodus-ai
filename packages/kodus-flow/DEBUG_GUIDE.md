# Guia de Debug - Kodus Flow

## Como Usar o Debugger da IDE

### 1. Configuração do VS Code

O arquivo `.vscode/launch.json` tem duas configurações simples:

- **Debug Exemplo Atual**: Debug do arquivo que está aberto no editor
- **Debug Qualquer Exemplo**: Escolha qualquer exemplo da lista

### 2. Como Iniciar o Debug

#### Opção 1: Debug do Arquivo Atual (Mais Simples)
1. **Abra qualquer arquivo** de exemplo no editor
2. **Coloque breakpoints** onde quiser (clique na linha)
3. **Pressione F5** ou use "Run and Debug" → "Debug Exemplo Atual"

#### Opção 2: Escolher Exemplo Específico
1. **Vá para "Run and Debug"** (Ctrl+Shift+D)
2. **Selecione "Debug Qualquer Exemplo"**
3. **Escolha o exemplo** da lista que aparece
4. **Coloque breakpoints** onde quiser
5. **Clique em "Start Debugging"** (F5)

### 3. Como Usar de Forma Simples

#### Passo a Passo Rápido:
1. **Abra qualquer exemplo** em `examples/`
2. **Clique na linha** onde quer parar (breakpoint vermelho aparece)
3. **Pressione F5** - o debug inicia automaticamente
4. **Use F10** para próxima linha, **F11** para entrar em funções
5. **Veja as variáveis** no painel lateral

#### Exemplo Prático:
```typescript
// 1. Abra examples/simple-agent-patterns.ts
// 2. Clique na linha 15 (criação do orchestrator)
// 3. Clique na linha 25 (criação da tool)
// 4. Pressione F5
// 5. Navegue com F10/F11
```

### 4. Pontos de Debug no Código

O arquivo `examples/debug-agent-patterns.ts` tem pontos de debug marcados com 🔍 DEBUG BREAKPOINT:

#### Breakpoints Principais:

1. **🔍 DEBUG BREAKPOINT 1**: Criação do Orchestrator
   - Verifica se o SDK está sendo inicializado corretamente

2. **🔍 DEBUG BREAKPOINT 2**: Criação de Tools com Schemas
   - Verifica se as tools estão sendo criadas com schemas obrigatórios

3. **🔍 DEBUG BREAKPOINT 3**: Dentro da execução da tool
   - Verifica se a tool está sendo executada corretamente

4. **🔍 DEBUG BREAKPOINT 4**: Verificar tool criada
   - Verifica se a tool foi registrada corretamente

5. **🔍 DEBUG BREAKPOINT 6**: Testar Tool Diretamente
   - Verifica se o método `callTool` funciona

6. **🔍 DEBUG BREAKPOINT 8**: Criação de Agent
   - Verifica se o agent está sendo criado

7. **🔍 DEBUG BREAKPOINT 9**: Dentro do thinking do agent
   - Verifica se o agent está recebendo o contexto correto

8. **🔍 DEBUG BREAKPOINT 10**: Usando tool no agent
   - Verifica se o agent consegue usar as tools

9. **🔍 DEBUG BREAKPOINT 13**: Testar Agent
   - Verifica se o método `callAgent` funciona

### 4. Navegação no Debug

#### Controles Básicos:
- **F10**: Step Over (próxima linha)
- **F11**: Step Into (entrar na função)
- **Shift+F11**: Step Out (sair da função)
- **F5**: Continue (continuar até próximo breakpoint)

#### Variáveis e Watch:
- **Variables**: Veja variáveis locais e globais
- **Watch**: Adicione expressões para monitorar
- **Call Stack**: Veja a pilha de chamadas
- **Breakpoints**: Gerencie seus breakpoints

### 5. O que Observar Durante o Debug

#### 1. Criação do Orchestrator:
```typescript
// Verifique se o objeto tem todas as propriedades esperadas
console.log('Orchestrator:', orchestrator);
console.log('Tools engine:', orchestrator.tools);
console.log('Config:', orchestrator.config);
```

#### 2. Criação de Tools:
```typescript
// Verifique se a tool tem schema
console.log('Tool schema:', calculatorTool.schema);
console.log('Tool execute:', calculatorTool.execute);
```

#### 3. Execução de Tools:
```typescript
// Verifique se o input está correto
console.log('Tool input:', input);
// Verifique se o output está correto
console.log('Tool output:', result);
```

#### 4. Criação de Agents:
```typescript
// Verifique se o agent tem acesso às tools
console.log('Agent context tools:', context.tools);
console.log('Available tools:', Array.from(context.tools.keys()));
```

#### 5. Execução de Agents:
```typescript
// Verifique se o agent está recebendo o input correto
console.log('Agent input:', input);
// Verifique se o agent está retornando o resultado esperado
console.log('Agent result:', result);
```

### 6. Debug de Problemas Comuns

#### Problema: Tool não encontrada
```typescript
// Verifique se a tool foi registrada
console.log('Tools registradas:', orchestrator.tools);
// Verifique se o nome está correto
console.log('Nome da tool:', toolName);
```

#### Problema: Agent não consegue usar tool
```typescript
// Verifique se as tools estão no contexto
console.log('Tools no contexto:', context.tools);
// Verifique se a tool específica existe
console.log('Tool existe:', context.tools.has('tool.name'));
```

#### Problema: Schema inválido
```typescript
// Verifique se o schema está correto
console.log('Schema da tool:', tool.schema);
// Verifique se o input está validando
console.log('Input para validação:', input);
```

### 7. Dicas de Debug

1. **Use console.log estratégicos** para verificar valores intermediários
2. **Monitore o Call Stack** para entender o fluxo de execução
3. **Use Watch expressions** para monitorar variáveis específicas
4. **Verifique os tipos** no hover do mouse
5. **Use Step Into** para entrar em funções importantes
6. **Use Step Over** para pular implementações internas

### 8. Exemplo de Sessão de Debug

1. **Inicie o debug** com "Debug Agent Patterns"
2. **Coloque breakpoints** nos pontos marcados
3. **Execute passo a passo** observando:
   - Criação do orchestrator
   - Criação da tool com schema
   - Execução da tool
   - Criação do agent
   - Execução do agent com tool
4. **Verifique logs** no console
5. **Monitore variáveis** no painel de debug

### 9. Debug de Outros Exemplos

Para debugar outros exemplos, siga o mesmo processo:

1. **Selecione a configuração** apropriada no launch.json
2. **Adicione breakpoints** nos pontos importantes
3. **Execute com debug** (F5)
4. **Navegue pelo código** observando o comportamento

### 10. Troubleshooting

#### Se o debug não iniciar:
- Verifique se o `tsx` está instalado: `npm install -g tsx`
- Verifique se o TypeScript está configurado corretamente
- Verifique se os caminhos no launch.json estão corretos

#### Se os breakpoints não funcionarem:
- Verifique se está usando a configuração correta
- Verifique se o arquivo está sendo executado
- Verifique se não há erros de compilação

#### Se as variáveis não aparecerem:
- Verifique se está no escopo correto
- Use console.log para verificar valores
- Verifique se não há erros de runtime 