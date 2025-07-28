#!/bin/bash

echo "🚀 Configurando Google Artifact Registry para @kodus/flow..."

# Verificar se gcloud está instalado
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI não encontrado. Instale em: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Verificar se está autenticado
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ Não autenticado no gcloud. Execute: gcloud auth login"
    exit 1
fi

# Configurar variáveis
PROJECT_ID=$(gcloud config get-value project)
REPO_NAME="npm-repo"
LOCATION="us-central1"

echo "📋 Configurações:"
echo "  - Project ID: $PROJECT_ID"
echo "  - Repository: $REPO_NAME"
echo "  - Location: $LOCATION"

# Gerar token de autenticação
echo "🔑 Gerando token de autenticação..."
TOKEN=$(gcloud auth print-access-token)

# Atualizar .npmrc com variáveis de ambiente
echo "📝 Atualizando .npmrc..."
sed -i.bak "s/SEU_PROJECT_ID/\${GAR_PROJECT_ID}/g" .npmrc

# Configurar variáveis de ambiente
echo "🔧 Configurando variáveis de ambiente..."
export NPM_TOKEN=$TOKEN
export GAR_PROJECT_ID=$PROJECT_ID

# Criar script para renovar token automaticamente
echo "📝 Criando script de renovação de token..."
cat > scripts/refresh-token.sh << EOF
#!/bin/bash
export NPM_TOKEN=\$(gcloud auth print-access-token)
export GAR_PROJECT_ID=$PROJECT_ID
echo "✅ Token renovado: \$(echo \$NPM_TOKEN | cut -c1-10)..."
EOF

chmod +x scripts/refresh-token.sh

echo "✅ Configuração concluída!"
echo ""
echo "📋 Próximos passos:"
echo "1. Execute: yarn build"
echo "2. Execute: yarn test:run"
echo "3. Execute: yarn publish:gar"
echo ""
echo "🔑 Token configurado: $TOKEN"
echo "📦 Registry: https://us-central1-npm.pkg.dev/$PROJECT_ID/$REPO_NAME/"
