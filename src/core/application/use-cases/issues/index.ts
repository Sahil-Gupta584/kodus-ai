import { GetIssuesByOrganizationUseCase } from './get-issues-by-organization.use-case';
import { ProcessPrClosedUseCase } from './process-pr-closed.use-case';
import { UpdateIssueStatusUseCase } from './update-issues-status.use-case';

export const UseCases = [
    ProcessPrClosedUseCase,
    GetIssuesByOrganizationUseCase,
    UpdateIssueStatusUseCase,
];