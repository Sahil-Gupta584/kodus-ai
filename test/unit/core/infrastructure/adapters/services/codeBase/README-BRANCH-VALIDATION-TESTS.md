# Branch Review Validation Tests

## Descrição

Este arquivo de testes (`branch-review-validation.spec.ts`) valida o comportamento da lógica de validação de branches implementada no `ValidateConfigStage`, especificamente focando nas funções auxiliares:

- `mergeBaseBranches()` - Mescla branches configuradas com o apiBaseBranch
- `processExpression()` - Processa expressões de branches em config
- `shouldReviewBranches()` - Determina se um PR deve ser revisado baseado nos padrões de branches

## Casos de Teste

### 1. Validação com Wildcards (Caso do test.json)

Testa o cenário real dos dados fornecidos:

```typescript
originalConfig: ['develop', 'feature/*', 'release/*'];
apiBaseBranch: 'refs/heads/master';
sourceBranch: 'refs/heads/topic/PLT-9221';
targetBranch: 'refs/heads/feature/PLT-4873';
```

**Resultado:** Retorna `false` porque o padrão `feature/*` não faz match com `refs/heads/feature/PLT-4873`. Os padrões precisam incluir o prefixo `refs/heads/` quando as branches usam esse prefixo.

### 2. Validação sem Prefixo refs/heads

Testa o mesmo cenário mas sem o prefixo `refs/heads/`:

```typescript
targetBranch: 'feature/PLT-4873';
```

**Resultado:** Retorna `true` porque `feature/*` faz match com `feature/PLT-4873`.

### 3. Merge de apiBaseBranch

Valida que o `apiBaseBranch` é adicionado aos branches configurados:

```typescript
originalConfig: ['develop', 'staging'];
apiBaseBranch: 'master';
```

**Resultado:** `mergedBranches` contém `['develop', 'staging', 'master']`

### 4. Padrões de Exclusão

Testa que padrões de exclusão (prefixo `!`) funcionam corretamente:

```typescript
originalConfig: ['develop', 'feature/*', '!main'];
targetBranch: 'main';
```

**Resultado:** Retorna `false` - PRs para `main` são bloqueados.

### 5. Múltiplos Wildcards

Valida que múltiplos padrões wildcard funcionam:

```typescript
originalConfig: ['feature/*', 'release/*', 'hotfix/*'];
```

### 6. Branches Exatas

Testa validação com nomes exatos de branches (sem wildcards).

### 7. Remoção de Duplicatas

Verifica que o `apiBaseBranch` não é duplicado se já existe na config:

```typescript
originalConfig: ['develop', 'main', 'staging'];
apiBaseBranch: 'main';
```

**Resultado:** Nenhuma duplicata de `main` nos `mergedBranches`.

### 8. Exclusão do apiBaseBranch

Valida que se `apiBaseBranch` está excluído na config, ele não é adicionado:

```typescript
originalConfig: ['develop', '!main'];
apiBaseBranch: 'main';
```

**Resultado:** `main` não é adicionado aos `mergedBranches`.

## Edge Cases

### Mismatch de Prefixo refs/heads

Demonstra que padrões sem prefixo não fazem match com branches com prefixo:

```typescript
pattern: 'feature/*';
branch: 'refs/heads/feature/test';
// Não faz match
```

### Match com Prefixo Consistente

Demonstra que quando ambos têm o prefixo, o match funciona:

```typescript
pattern: 'refs/heads/feature/*';
branch: 'refs/heads/feature/target';
// Faz match
```

## Execução dos Testes

Para executar apenas estes testes:

```bash
npm test -- branch-review-validation.spec.ts
```

## Insights Importantes

1. **Consistência de Prefixos**: Os padrões de branches devem usar o mesmo formato (com ou sem `refs/heads/`) que as branches reais para fazer match corretamente.

2. **Merge Automático**: O `mergeBaseBranches` sempre adiciona o `apiBaseBranch` aos padrões configurados, a menos que:
    - Já exista na lista
    - Esteja explicitamente excluído (com `!`)

3. **Especificidade**: Padrões mais específicos têm prioridade sobre padrões gerais na lógica de `shouldReviewBranches`.

4. **Exclusões**: Padrões com `!` têm a mais alta prioridade e sempre bloqueiam a revisão, independentemente de outros padrões.

## Relação com o Código de Produção

Estes testes validam o comportamento do método `shouldExecuteReview` no `ValidateConfigStage`:

```typescript
// src/core/infrastructure/adapters/services/codeBase/codeReviewPipeline/stages/validate-config.stage.ts
// linhas 478-510

if (config?.baseBranches && Array.isArray(config.baseBranches)) {
    const mergedBranches = mergeBaseBranches(
        config.baseBranches,
        apiBaseBranch || targetBranch,
    );
    const expression = mergedBranches.join(', ');
    const reviewConfig = processExpression(expression);

    const resultValidation = shouldReviewBranches(
        sourceBranch,
        targetBranch,
        reviewConfig,
    );

    return resultValidation;
}
```

## Melhorias Futuras

1. Adicionar suporte para normalização automática de prefixos `refs/heads/`
2. Adicionar validação de padrões inválidos durante a configuração
3. Adicionar mensagens de erro mais descritivas quando um padrão não faz match
