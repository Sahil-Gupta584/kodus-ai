import { GetIssuesByFiltersUseCase } from './get-issues-by-filters.use-case';
import { ProcessPrClosedUseCase } from './process-pr-closed.use-case';
import { UpdateIssueStatusUseCase } from './update-issues-status.use-case';

export const UseCases = [
    ProcessPrClosedUseCase,
    GetIssuesByFiltersUseCase,
    UpdateIssueStatusUseCase,
];