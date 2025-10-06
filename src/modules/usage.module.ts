import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LogModelInstance } from '@/core/infrastructure/adapters/repositories/mongoose/schema';
import { TokenUsageService } from '@/core/infrastructure/adapters/services/usage/token-usage.service';
import { TokenUsageController } from '@/core/infrastructure/http/controllers/token-usage.controller';
import { TokenUsageRepository } from '@/core/infrastructure/adapters/repositories/mongoose/token-usage.repository';
import { TOKEN_USAGE_REPOSITORY_TOKEN } from '@/core/domain/tokenUsage/contracts/token-usage.repository.contract';
import { TOKEN_USAGE_SERVICE_TOKEN } from '@/core/domain/tokenUsage/contracts/token-usage.service.contract';

@Module({
    imports: [MongooseModule.forFeature([LogModelInstance])],
    providers: [
        { provide: TOKEN_USAGE_SERVICE_TOKEN, useClass: TokenUsageService },
        { provide: TOKEN_USAGE_REPOSITORY_TOKEN, useClass: TokenUsageRepository },
    ],
    controllers: [TokenUsageController],
    exports: [TOKEN_USAGE_SERVICE_TOKEN],
})
export class UsageModule {}
