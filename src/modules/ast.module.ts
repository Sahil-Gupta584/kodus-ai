import { forwardRef, Module } from '@nestjs/common';
import { CodebaseModule } from './codeBase.module';
import { PlatformIntegrationModule } from './platformIntegration.module';
import { LogModule } from './log.module';
import { IntegrationConfigModule } from './integrationConfig.module';
import { CodeAnalyzerService } from '@/ee/codeBase/ast/services/code-analyzer.service';

@Module({
    imports: [
        forwardRef(() => CodebaseModule),
        forwardRef(() => PlatformIntegrationModule),
        forwardRef(() => IntegrationConfigModule),
        LogModule,
    ],
    providers: [CodeAnalyzerService],
    exports: [CodeAnalyzerService],
})
export class AstModule {}
