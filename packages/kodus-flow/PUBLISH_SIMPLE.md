# 🚀 Publicar Pacote no GAR - Guia Simples

## 📋 Pré-requisitos

```bash
# 1. Instalar gcloud
brew install google-cloud-sdk

# 2. Login
gcloud auth login

# 3. Configurar projeto
gcloud config set project SEU_PROJECT_ID
```

## 🔧 Setup (Uma vez só)

```bash
# 1. Habilitar API
gcloud services enable artifactregistry.googleapis.com

# 2. Configurar .npmrc
echo "@kodus:registry=https://us-central1-npm.pkg.dev/$(gcloud config get-value project)/kodus-pkg/" > .npmrc

# 3. Criar repositório (se necessário)
gcloud artifacts repositories create kodus-pkg \
    --repository-format=npm \
    --location=us-central1
```

## 📦 Publicar

```bash
# 1. Build
yarn build

# 2. Publicar com projectId específico
./scripts/publish-with-project.sh [SEU_PROJECT_ID]

# Ou com projectId configurado
yarn publish:quick
```

## 🔍 Verificar

```bash
# Ver pacotes publicados
gcloud artifacts packages list --repository=kodus-pkg --location=us-central1

# Testar instalação
npm view @kodus/flow --registry=https://us-central1-npm.pkg.dev/[SEU_PROJECT_ID]/kodus-pkg/
```

## 🎯 Pronto!

- ✅ **Setup**: Uma vez só
- ✅ **Publicar**: Um comando
- ✅ **Verificar**: Dois comandos

**É só isso!** 🚀 
