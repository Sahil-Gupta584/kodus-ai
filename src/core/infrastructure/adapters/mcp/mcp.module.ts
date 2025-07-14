import { Module, DynamicModule, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpController } from './controllers/mcp.controller';
import { McpServerService } from './services/mcp-server.service';
import { McpEnabledGuard } from './guards/mcp-enabled.guard';
import { PlatformIntegrationModule } from '../../../../modules/platformIntegration.module';
import { CodeManagementTools, RepositoryTools } from './tools';

@Module({})
export class McpModule {
    static forRoot(configService?: ConfigService): DynamicModule {
        const imports = [];
        const providers: Provider[] = [];
        const controllers = [];
        const exports = [];

        const isEnabled =
            process.env.API_MCP_SERVER_ENABLED === 'true' ||
            configService?.get<boolean>('API_MCP_SERVER_ENABLED', false);

        if (isEnabled) {
            imports.push(PlatformIntegrationModule);

            controllers.push(McpController);

            providers.push(
                McpServerService,
                McpEnabledGuard,
                CodeManagementTools,
                RepositoryTools,
            );

            exports.push(McpServerService);
        }

        return {
            module: McpModule,
            imports,
            controllers,
            providers,
            exports,
        };
    }
}
