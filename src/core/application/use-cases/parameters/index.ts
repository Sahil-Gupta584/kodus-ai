import { CopyCodeReviewParameterUseCase } from './copy-code-review-parameter.use-case';
import { CreateOrUpdateParametersUseCase } from './create-or-update-use-case';
import { DeleteRepositoryCodeReviewParameterUseCase } from './delete-repository-code-review-parameter.use-case';
import { FindByKeyParametersUseCase } from './find-by-key-use-case';
import { GenerateKodusConfigFileUseCase } from './generate-kodus-config-file.use-case';
import { ListCodeReviewAutomationLabelsUseCase } from './list-code-review-automation-labels-use-case';
import { SaveArtifactsStructureUseCase } from './save-artifacts-structure.use-case';
import { UpdateCodeReviewParameterRepositoriesUseCase } from './update-code-review-parameter-repositories-use-case';
import { UpdateOrCreateCodeReviewParameterUseCase } from './update-or-create-code-review-parameter-use-case';
import { PreviewPrSummaryUseCase } from './preview-pr-summary.use-case';
import { MigrateCodeReviewParametersUseCase } from './migrate-code-review-parameters.use-case'; // TODO: Remove once all orgs have migrated
import { GetDefaultConfigUseCase } from './get-default-config.use-case';
import { GetCodeReviewParameterUseCase } from './get-code-review-parameter.use-case';

export const UseCases = [
    CreateOrUpdateParametersUseCase,
    FindByKeyParametersUseCase,
    ListCodeReviewAutomationLabelsUseCase,
    SaveArtifactsStructureUseCase,
    UpdateOrCreateCodeReviewParameterUseCase,
    UpdateCodeReviewParameterRepositoriesUseCase,
    GenerateKodusConfigFileUseCase,
    CopyCodeReviewParameterUseCase,
    DeleteRepositoryCodeReviewParameterUseCase,
    PreviewPrSummaryUseCase,
    GetDefaultConfigUseCase,
    GetCodeReviewParameterUseCase,
    MigrateCodeReviewParametersUseCase, // TODO: Remove once all orgs have migrated
];
