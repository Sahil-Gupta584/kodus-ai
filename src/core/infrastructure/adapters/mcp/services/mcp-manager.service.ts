import { AxiosMCPManagerService } from '@/config/axios/microservices/mcpManager.axios';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { MCPServerConfig } from '@kodus/flow';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PinoLoggerService } from '../../services/logger/pino.service';
import { PermissionValidationService } from '@/ee/shared/services/permissionValidation.service';

type MCPConnection = {
    id: string;
    mcpUrl: string;
    status: string;
    appName: string;
    authUrl: string;
    allowedTools: string[];
};

type Metadata = {
    connection: MCPConnection;
};

type MCPItem = {
    id: string;
    organizationId: string;
    integrationId: string;
    provider: string;
    status: string;
    appName: string;
    mcpUrl: string;
    allowedTools: string[];
    metadata: Metadata;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

type MCPData = {
    items: MCPItem[];
};

export const KODUS_MCP_INTEGRATION_ID = 'kd_mcp_oTUrzqsaxTg';

@Injectable()
export class MCPManagerService {
    private axiosMCPManagerService: AxiosMCPManagerService;

    constructor(
        private readonly jwt: JwtService,
        private readonly logger: PinoLoggerService,
        private readonly permissionValidationService: PermissionValidationService,
    ) {
        this.axiosMCPManagerService = new AxiosMCPManagerService();
    }

    private generateToken(organizationId: string): string {
        return this.jwt.sign(
            {
                organizationId,
            },
            {
                secret: process.env.API_JWT_SECRET || '',
            },
        );
    }

    private getAuthHeaders(organizationAndTeamData: OrganizationAndTeamData): {
        Authorization: string;
    } {
        const token = this.generateToken(
            organizationAndTeamData.organizationId,
        );
        return {
            Authorization: `Bearer ${token}`,
        };
    }

    public async getConnections(
        organizationAndTeamData: OrganizationAndTeamData,
        format?: true,
    ): Promise<MCPServerConfig[]>;

    public async getConnections(
        organizationAndTeamData: OrganizationAndTeamData,
        format?: false,
    ): Promise<MCPItem[]>;

    public async getConnections(
        organizationAndTeamData: OrganizationAndTeamData,
        format: boolean = true,
        filters?: {
            provider?: string;
            status?: string;
        },
    ): Promise<MCPItem[] | MCPServerConfig[]> {
        try {
            const limited =
                await this.permissionValidationService.shouldLimitResources(
                    organizationAndTeamData,
                    MCPManagerService.name,
                );

            const { provider, status = 'ACTIVE' } = filters || {};

            const data: MCPData = await this.axiosMCPManagerService.get(
                'mcp/connections',
                {
                    headers: this.getAuthHeaders(organizationAndTeamData),
                    params: { provider, status },
                },
            );

            if (!data) {
                return [];
            }

            const limitedData = limited ? data.items.slice(0, 3) : data.items;

            if (format) {
                return limitedData.map((connection) =>
                    this.formatConnection(connection),
                );
            }

            return limitedData;
        } catch (error) {
            this.logger.error({
                message: 'Error fetching MCP connections',
                context: MCPManagerService.name,
                error: error,
                metadata: { organizationAndTeamData },
            });
            return [];
        }
    }

    public async createKodusMCPIntegration(
        organizationId: string,
    ): Promise<void> {
        try {
            const organizationAndTeamData: OrganizationAndTeamData = {
                organizationId,
            };

            await this.axiosMCPManagerService.post(
                `mcp/integration/kodusmcp`,
                {
                    integrationId: KODUS_MCP_INTEGRATION_ID,
                    mcpUrl: process.env.API_KODUS_MCP_SERVER_URL ?? '',
                },
                {
                    headers: this.getAuthHeaders(organizationAndTeamData),
                },
            );
        } catch (error) {
            this.logger.error({
                message: 'Error creating Kodus MCP integration',
                context: MCPManagerService.name,
                error: error,
                metadata: { organizationId },
            });
            return null;
        }
    }

    private formatConnection(connection: MCPItem): MCPServerConfig {
        return {
            name: connection.appName,
            provider: connection.provider,
            type: 'http',
            url: connection.mcpUrl,
            headers: {
                ...this.getAuthHeaders({
                    organizationId: connection.organizationId,
                }),
                'Content-Type': 'application/json',
            },
            retries: 1,
            timeout: 10_000,
            allowedTools: connection.allowedTools,
        };
    }
}
