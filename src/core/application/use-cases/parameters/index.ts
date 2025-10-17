import { CopyCodeReviewParameterUseCase } from './copy-code-review-parameter.use-case';
import { CreateOrUpdateParametersUseCase } from './create-or-update-use-case';
import { DeleteRepositoryCodeReviewParameterUseCase } from './delete-repository-code-review-parameter.use-case';
import { FindByKeyParametersUseCase } from './find-by-key-use-case';
import { GenerateKodusConfigFileUseCase } from './generate-kodus-config-file.use-case';
import { ListCodeReviewAutomationLabelsUseCase } from './list-code-review-automation-labels-use-case';
import { UpdateCodeReviewParameterRepositoriesUseCase } from './update-code-review-parameter-repositories-use-case';
import { UpdateOrCreateCodeReviewParameterUseCase } from './update-or-create-code-review-parameter-use-case';
import { PreviewPrSummaryUseCase } from './preview-pr-summary.use-case';
import { UpdateOrCreateIssuesParameterUseCase } from './update-or-create-issues-parameter-use-case';
import { ListCodeReviewV2DefaultsUseCase } from './list-code-review-v2-defaults.use-case';
import { ListCodeReviewAutomationLabelsWithStatusUseCase } from './list-code-review-automation-labels-with-status.use-case';
import { MigrateCodeReviewParametersUseCase } from './migrate-code-review-parameters.use-case'; // TODO: Remove once all orgs have migrated
import { GetDefaultConfigUseCase } from './get-default-config.use-case';
import { GetCodeReviewParameterUseCase } from './get-code-review-parameter.use-case';

export const UseCases = [
    CreateOrUpdateParametersUseCase,
    FindByKeyParametersUseCase,
    ListCodeReviewAutomationLabelsUseCase,
    UpdateOrCreateCodeReviewParameterUseCase,
    UpdateCodeReviewParameterRepositoriesUseCase,
    GenerateKodusConfigFileUseCase,
    CopyCodeReviewParameterUseCase,
    DeleteRepositoryCodeReviewParameterUseCase,
    PreviewPrSummaryUseCase,
    UpdateOrCreateIssuesParameterUseCase,
    ListCodeReviewV2DefaultsUseCase,
    ListCodeReviewAutomationLabelsWithStatusUseCase,
    GetDefaultConfigUseCase,
    GetCodeReviewParameterUseCase,
    MigrateCodeReviewParametersUseCase, // TODO: Remove once all orgs have migrated
];
