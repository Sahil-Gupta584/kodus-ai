import { forwardRef, Module } from '@nestjs/common';
import { CodebaseModule } from '../../modules/codeBase.module';
import { PlatformIntegrationModule } from '../../modules/platformIntegration.module';
import { LogModule } from '../../modules/log.module';
import { IntegrationConfigModule } from '../../modules/integrationConfig.module';
import { CodeAnalyzerService } from '@/ee/kodyAST/code-analyzer.service';
import { LLMProviderModule } from '../../modules/llmProvider.module';
import { ClientsModule } from '@nestjs/microservices';
import { AST_MICROSERVICE_OPTIONS } from '@/ee/configs/microservices/ast-options';
import { AST_ANALYSIS_SERVICE_TOKEN } from '@/core/domain/codeBase/contracts/ASTAnalysisService.contract';
import { CodeAstAnalysisService } from '@/ee/kodyAST/codeASTAnalysis.service';
import { environment } from '@/ee/configs/environment';
import { ASTDeserializerService } from './ast-deserializer.service';

@Module({})
export class KodyASTModule {
    static register() {
        const imports = [
            forwardRef(() => CodebaseModule),
            forwardRef(() => PlatformIntegrationModule),
            forwardRef(() => IntegrationConfigModule),
            forwardRef(() => LLMProviderModule),
            LogModule,
        ];
        const exports = [
            CodeAnalyzerService,
            AST_ANALYSIS_SERVICE_TOKEN,
            ASTDeserializerService,
        ];

        if (
            environment.API_CLOUD_MODE &&
            process.env.API_ENABLE_CODE_REVIEW_AST
        ) {
            return {
                module: KodyASTModule,
                imports: [
                    ...imports,
                    ClientsModule.register([AST_MICROSERVICE_OPTIONS]),
                ],
                providers: [
                    CodeAnalyzerService,
                    {
                        provide: AST_ANALYSIS_SERVICE_TOKEN,
                        useClass: CodeAstAnalysisService,
                    },
                    ASTDeserializerService,
                ],
                exports,
            };
        }

        // keep imports and exports consistent to avoid
        // inconsistencies when switching between cloud
        // and self-hosted modes, specially during development
        return {
            module: KodyASTModule,
            imports,
            providers: [
                {
                    provide: AST_ANALYSIS_SERVICE_TOKEN,
                    useValue: null,
                },
                {
                    provide: CodeAnalyzerService,
                    useValue: null,
                },
                {
                    provide: ASTDeserializerService,
                    useClass: null,
                },
            ],
            exports,
        };
    }
}
