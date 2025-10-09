import { Injectable, Inject } from "@nestjs/common";
import { ORGANIZATION_PARAMETERS_SERVICE_TOKEN, IOrganizationParametersService } from "@/core/domain/organizationParameters/contracts/organizationParameters.service.contract";

@Injectable()
export class DeleteByokConfigUseCase {
    constructor(
        @Inject(ORGANIZATION_PARAMETERS_SERVICE_TOKEN)
        private readonly organizationParametersService: IOrganizationParametersService,
    ) {}

    async execute(organizationId: string, configType: 'main' | 'fallback') {
        return await this.organizationParametersService.deleteByokConfig(organizationId, configType);
    }
}