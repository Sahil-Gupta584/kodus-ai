import { Global, Module } from '@nestjs/common';
import { CodeAnalyzerService } from '@/ee/kodyAST/code-analyzer.service';
import { AST_ANALYSIS_SERVICE_TOKEN } from '@/core/domain/codeBase/contracts/ASTAnalysisService.contract';
import { CodeAstAnalysisService } from '@/ee/kodyAST/codeASTAnalysis.service';
import { ASTDeserializerService } from './ast-deserializer.service';
import { LLMProviderModule } from '@/modules/llmProvider.module';
import { LogModule } from '@/modules/log.module';
import { DiffAnalyzerService } from '../codeBase/diffAnalyzer.service';
import { PlatformIntegrationModule } from '@/modules/platformIntegration.module';
import { ClientsModule } from '@nestjs/microservices';
import { AST_MICROSERVICE_OPTIONS } from '../configs/microservices/ast-options';
import { environment } from '../configs/environment';

const staticImports = [LLMProviderModule, LogModule, PlatformIntegrationModule];
const dynamicImports =
    environment.API_CLOUD_MODE && process.env.API_ENABLE_CODE_REVIEW_AST
        ? [ClientsModule.register([AST_MICROSERVICE_OPTIONS])]
        : [];

const providers = [];
const moduleExports = [
    CodeAnalyzerService,
    ASTDeserializerService,
    DiffAnalyzerService,
    AST_ANALYSIS_SERVICE_TOKEN,
];

if (environment.API_CLOUD_MODE && process.env.API_ENABLE_CODE_REVIEW_AST) {
    providers.push(
        CodeAnalyzerService,
        ASTDeserializerService,
        DiffAnalyzerService,
        {
            provide: AST_ANALYSIS_SERVICE_TOKEN,
            useClass: CodeAstAnalysisService,
        },
    );
} else {
    // Self-hosted mode, provide null services
    providers.push(
        { provide: CodeAnalyzerService, useValue: null },
        { provide: ASTDeserializerService, useValue: null },
        { provide: DiffAnalyzerService, useValue: null },
        { provide: AST_ANALYSIS_SERVICE_TOKEN, useValue: null },
    );
}

@Global()
@Module({
    imports: [...staticImports, ...dynamicImports],
    providers,
    exports: moduleExports,
})
export class KodyASTModule {}
