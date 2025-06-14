import { BuildFilterUseCase } from './build-filter.use-case';
import { GenerateIssuesFromPrClosedUseCase } from './generate-issues-from-pr-closed.use-case';
import { GetIssueByIdUseCase } from './get-issue-by-id.use-case';
import { GetIssuesByFiltersUseCase } from './get-issues-by-filters.use-case';
import { GetTotalIssuesUseCase } from './get-total-issues.use-case';
import { UpdateIssueStatusUseCase } from './update-issues-status.use-case';

export const UseCases = [
    GenerateIssuesFromPrClosedUseCase,
    GetIssuesByFiltersUseCase,
    UpdateIssueStatusUseCase,
    BuildFilterUseCase,
    GetTotalIssuesUseCase,
    GetIssueByIdUseCase,
];