# 📦 Guia de Publicação - Google Artifact Registry

## 🚀 **Setup Inicial**

### **1. Pré-requisitos**
```bash
# Instalar Google Cloud SDK
# https://cloud.google.com/sdk/docs/install

# Autenticar no Google Cloud
gcloud auth login
gcloud config set project SEU_PROJECT_ID
```

### **2. Configurar GAR**
```bash
# Executar script de setup
./scripts/setup-gar.sh
```

## 📋 **Processo de Publicação**

### **1. Build e Teste**
```bash
# Build do projeto
yarn build

# Executar testes
yarn test:run

# Verificar build
yarn test:build
```

### **2. Publicar**
```bash
# Publicar patch (0.1.1)
yarn publish:gar:patch

# Publicar minor (0.2.0)
yarn publish:gar:minor

# Publicar major (1.0.0)
yarn publish:gar:major
```

## 🔧 **Configurações**

### **.npmrc**
```bash
# Google Artifact Registry Configuration
@kodus:registry=https://us-central1-npm.pkg.dev/SEU_PROJECT_ID/npm-repo/
//us-central1-npm.pkg.dev/SEU_PROJECT_ID/npm-repo/:_authToken=${NPM_TOKEN}

# Fallback para npm público
registry=https://registry.npmjs.org/
```

### **Variáveis de Ambiente**
```bash
# Configurar token
export NPM_TOKEN=$(gcloud auth print-access-token)
```

## 📦 **Usar o Pacote**

### **Instalar**
```bash
# Configurar .npmrc no projeto cliente
echo "@kodus:registry=https://us-central1-npm.pkg.dev/SEU_PROJECT_ID/npm-repo/" >> .npmrc

# Instalar
npm install @kodus/flow
```

### **Importar**
```typescript
// ESM
import { createOrchestration } from '@kodus/flow';

// CommonJS
const { createOrchestration } = require('@kodus/flow');
```

## 🚨 **Troubleshooting**

### **Erro de Autenticação**
```bash
# Renovar token
export NPM_TOKEN=$(gcloud auth print-access-token)
```

### **Erro de Registry**
```bash
# Verificar configuração
npm config list

# Limpar cache
npm cache clean --force
```

### **Erro de Build**
```bash
# Limpar e rebuildar
yarn clean
yarn build
```

## 📊 **Métricas**

- **Bundle Size**: ~394KB
- **TypeScript**: ✅ Suporte completo
- **ESM/CJS**: ✅ Dual package
- **Sourcemaps**: ✅ Incluídos
- **Tree Shaking**: ✅ Otimizado

## 🎯 **Status Atual**

- ✅ **Build System**: Configurado
- ✅ **Tests**: Funcionando
- ✅ **GAR Setup**: Script criado
- ✅ **Publish Scripts**: Adicionados
- ⚠️ **Autenticação**: Precisa configurar PROJECT_ID

## 🚀 **Próximos Passos**

1. **Configurar PROJECT_ID** no .npmrc
2. **Executar** `./scripts/setup-gar.sh`
3. **Testar** build e testes
4. **Publicar** primeira versão

**O pacote está pronto para publicação no Google Artifact Registry!** 🎉 