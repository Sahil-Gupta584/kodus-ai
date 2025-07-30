# 📦 Publicação Simplificada - Kodus Common

## 🚀 Publicar

```bash
# 1. Build
yarn prepack

# 2. Publicar com projectId específico
./scripts/publish-with-project.sh [SEU_PROJECT_ID]

# Ou com projectId configurado
yarn publish:quick
```

## 📋 Pré-requisitos

1. **gcloud CLI instalado e autenticado**
   ```bash
   gcloud auth login
   ```

2. **Project ID configurado** (opcional)
   ```bash
   gcloud config set project SEU_PROJECT_ID
   ```

## 🔧 Comandos Disponíveis

- `yarn prepack` - Build do projeto
- `yarn publish:gar` - Publicar no GAR
- `yarn refresh-token` - Renovar token de autenticação
- `yarn publish:quick` - Build + publicar rapidamente
- `./scripts/publish-with-project.sh [PROJECT_ID]` - Publicar com projectId específico

## 📦 Testar instalação

```bash
# Em outro projeto
npm install @kodus/kodus-common

# Ou com yarn
yarn add @kodus/kodus-common
```

## 🎯 Estrutura Padronizada

Este projeto agora usa a mesma estrutura do `kodus-flow`:
- ✅ Scripts padronizados
- ✅ Configuração segura
- ✅ Mesmo registry (`kodus-pkg`)
- ✅ Autenticação temporária 
