import { BuildFilterUseCase } from './build-filter.use-case';
import { GetIssueByIdUseCase } from './get-issue-by-id.use-case';
import { GetIssuesByFiltersUseCase } from './get-issues-by-filters.use-case';
import { GetTotalIssuesUseCase } from './get-total-issues.use-case';
import { ProcessPrClosedUseCase } from './process-pr-closed.use-case';
import { UpdateIssueStatusUseCase } from './update-issues-status.use-case';

export const UseCases = [
    ProcessPrClosedUseCase,
    GetIssuesByFiltersUseCase,
    UpdateIssueStatusUseCase,
    BuildFilterUseCase,
    GetTotalIssuesUseCase,
    GetIssueByIdUseCase,
];