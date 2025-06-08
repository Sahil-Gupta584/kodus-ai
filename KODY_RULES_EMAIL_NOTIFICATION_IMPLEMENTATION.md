# Implementação do Sistema de Notificação por Email para Novas Regras Kody

## Visão Geral

Este documento descreve a implementação completa do sistema de notificação por email que é disparado automaticamente quando novas regras Kody são geradas pelo processo de aprendizado automático.

## Componentes Implementados

### 1. Função de Email (`src/shared/utils/email/sendMail.ts`)

Adicionada a função `sendKodyRulesNotification` que:
- Utiliza o template `yzkq340nv50gd796` já configurado no MailerSend
- Limita o número de regras exibidas no email para 3 (evita emails muito longos)
- Envia emails personalizados para cada usuário da organização
- Inclui informações da organização e contagem total de regras

**Parâmetros do template:**
```javascript
{
    user: { name: string },
    organization: { name: string },
    rules: [{ title: string, rule: string, severity: string }], // máximo 3
    rulesCount: number // total de regras geradas
}
```

### 2. Use Case de Notificação (`src/core/application/use-cases/kodyRules/send-rules-notification.use-case.ts`)

O `SendRulesNotificationUseCase` é responsável por:
- Buscar usuários ativos da organização
- Obter dados da organização (nome)
- Formatar dados para o template de email
- Coordenar o envio de emails
- Logging detalhado de sucessos e falhas
- Tratamento robusto de erros sem interromper o fluxo principal

**Funcionalidades principais:**
- Validação de dados de entrada
- Busca de usuários com status `ACTIVE`
- Extração inteligente de nomes de usuários
- Envio paralelo de emails
- Métricas de sucesso/falha
- Logs estruturados para debug

### 3. Integração com Geração de Regras

O `GenerateKodyRulesUseCase` foi modificado para:
- Rastrear regras criadas durante o processo
- Disparar notificação automaticamente ao final do processo
- Executar notificação de forma assíncrona (não bloqueia o fluxo principal)
- Continuar o processo mesmo se a notificação falhar

**Comportamento:**
- Só envia notificação se pelo menos uma regra foi criada
- Execução não-bloqueante da notificação
- Logs detalhados do processo de notificação

### 4. Configuração de Módulos

Atualizados os seguintes arquivos para registrar os novos componentes:
- `src/core/application/use-cases/kodyRules/index.ts` - Registra o novo Use Case
- `src/modules/kodyRules.module.ts` - Adiciona dependências e exports necessários

## Fluxo Completo

1. **Trigger:** Cron job `KodyLearningCronProvider` executa semanalmente
2. **Geração:** `GenerateKodyRulesUseCase` processa repositórios e gera regras
3. **Rastreamento:** Cada regra criada é adicionada ao array `createdRules`
4. **Notificação:** Se `createdRules.length > 0`, dispara `SendRulesNotificationUseCase`
5. **Busca de dados:** Use case busca usuários ativos e dados da organização
6. **Envio:** Emails são enviados para todos os usuários usando o template configurado
7. **Logging:** Métricas detalhadas de sucesso/falha são registradas

## Configurações Necessárias

### Variáveis de Ambiente
Certifique-se de que as seguintes variáveis estão configuradas:
- `API_MAILSEND_API_TOKEN` - Token de API do MailerSend

### Template de Email
O template `yzkq340nv50gd796` deve estar configurado no MailerSend com os seguintes campos:
- `user.name` - Nome do usuário
- `organization.name` - Nome da organização
- `rules` - Array de regras (máximo 3)
- `rulesCount` - Número total de regras geradas

## Características Técnicas

### Tratamento de Erros
- Falhas na notificação não interrompem o processo principal de geração de regras
- Logs detalhados para troubleshooting
- Promise.allSettled para garantir que falhas individuais não afetem outros emails

### Performance
- Execução assíncrona da notificação
- Envio paralelo de emails
- Limitação de regras no email (máximo 3) para evitar emails muito grandes

### Segurança
- Validação de entrada
- Filtragem apenas de usuários ativos
- Logs sem exposição de dados sensíveis

### Observabilidade
- Logs estruturados em todas as etapas
- Métricas de sucessos e falhas
- Rastreamento de performance
- Context apropriado para cada log

## Testes Recomendados

### Cenários de Teste

1. **Teste básico:**
   - Organização com usuários ativos
   - Geração de 1-3 regras
   - Verificar recebimento de emails

2. **Teste de volume:**
   - Organização com muitos usuários (>10)
   - Geração de muitas regras (>3)
   - Verificar que apenas 3 regras aparecem no email

3. **Teste de edge cases:**
   - Organização sem usuários ativos
   - Organização inexistente
   - Falha no serviço de email
   - Template de email inválido

4. **Teste de performance:**
   - Geração de regras com notificação ativa
   - Verificar que não há impacto significativo no tempo de processamento

### Verificações de Integração

1. **Cron job execution:**
   ```bash
   # Verificar logs do cron job
   grep "Kody Rules generator cron" /var/log/application.log
   ```

2. **Geração de regras:**
   ```bash
   # Verificar regras criadas
   grep "Rule generated and saved successfully" /var/log/application.log
   ```

3. **Notificações enviadas:**
   ```bash
   # Verificar notificações disparadas
   grep "Email notifications completed" /var/log/application.log
   ```

## Monitoramento

### Métricas Importantes
- Taxa de sucesso de envio de emails
- Tempo de processamento da notificação
- Número de regras geradas por execução
- Número de usuários notificados por organização

### Alertas Sugeridos
- Falha consistente no envio de emails (>50% de falha)
- Tempo de processamento de notificação > 30 segundos
- Erros de configuração de template

## Manutenção

### Logs para Monitorar
- `Starting Kody Rules notification process`
- `Email notifications completed`
- `Some email notifications failed`
- `Error in Kody Rules notification process`

### Possíveis Melhorias Futuras
1. **Personalização avançada:** Permitir usuários escolherem frequência de notificação
2. **Templates múltiplos:** Diferentes templates baseados no número de regras
3. **Batching inteligente:** Agrupar notificações de múltiplas execuções
4. **Canais alternativos:** Integração com Slack, MS Teams, etc.
5. **Preview de regras:** Incluir snippets de código no email

## Troubleshooting

### Problemas Comuns

1. **Emails não são enviados:**
   - Verificar `API_MAILSEND_API_TOKEN`
   - Verificar se template `yzkq340nv50gd796` existe
   - Verificar logs de erro do MailerSend

2. **Usuários não recebem emails:**
   - Verificar se usuários têm status `ACTIVE`
   - Verificar se organização existe
   - Verificar logs de envio

3. **Performance degradada:**
   - Verificar número de usuários na organização
   - Verificar tempo de resposta do MailerSend
   - Considerar implementar batching

4. **Template malformado:**
   - Verificar estrutura de dados enviada para o template
   - Validar que todos os campos obrigatórios estão presentes
   - Testar template com dados de exemplo