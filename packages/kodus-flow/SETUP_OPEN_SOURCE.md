# 🔒 Setup Seguro para Open Source

## 🚀 **Para Desenvolvedores**

### **1. Configurar Variáveis de Ambiente**
```bash
# Configurar PROJECT_ID
export GAR_PROJECT_ID="seu-project-id"

# Configurar token (renovar a cada hora)
export NPM_TOKEN=$(gcloud auth print-access-token)
```

### **2. Configurar .npmrc**
```bash
# Copiar template
cp .npmrc.template .npmrc

# Ou criar manualmente
echo "@kodus:registry=https://us-central1-npm.pkg.dev/\${GAR_PROJECT_ID}/npm-repo/" > .npmrc
echo "//us-central1-npm.pkg.dev/\${GAR_PROJECT_ID}/npm-repo/:_authToken=\${NPM_TOKEN}" >> .npmrc
echo "registry=https://registry.npmjs.org/" >> .npmrc
```

### **3. Executar Setup**
```bash
# Executar script de setup
./scripts/setup-gar.sh
```

## 🔒 **Segurança**

### **✅ O que está seguro:**
- ✅ **PROJECT_ID** em variável de ambiente
- ✅ **NPM_TOKEN** em variável de ambiente
- ✅ **.npmrc** no .gitignore
- ✅ **Template** sem dados sensíveis

### **❌ O que NÃO está no repositório:**
- ❌ **Tokens de autenticação**
- ❌ **Project IDs específicos**
- ❌ **Credenciais pessoais**

## 📋 **Para CI/CD**

### **GitHub Actions**
```yaml
env:
  GAR_PROJECT_ID: ${{ secrets.GAR_PROJECT_ID }}
  NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### **GitLab CI**
```yaml
variables:
  GAR_PROJECT_ID: $GAR_PROJECT_ID
  NPM_TOKEN: $NPM_TOKEN
```

## 🚨 **Troubleshooting**

### **Token Expirado**
```bash
# Renovar token
export NPM_TOKEN=$(gcloud auth print-access-token)
```

### **Project ID Errado**
```bash
# Verificar project atual
gcloud config get-value project

# Configurar project correto
export GAR_PROJECT_ID="project-id-correto"
```

## 🎯 **Resumo**

- ✅ **Seguro para open source**
- ✅ **Variáveis de ambiente**
- ✅ **Template sem dados sensíveis**
- ✅ **CI/CD ready**

**Agora está seguro para open source!** 🔒 
