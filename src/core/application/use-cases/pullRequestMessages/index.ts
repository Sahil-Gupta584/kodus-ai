import { CreateOrUpdatePullRequestMessagesUseCase } from './create-or-update-pull-request-messages.use-case';
import { FindByRepositoryIdPullRequestMessagesUseCase } from './find-by-repository-id.use-case';

export const PullRequestMessagesUseCases = [
    CreateOrUpdatePullRequestMessagesUseCase,
    FindByRepositoryIdPullRequestMessagesUseCase,
];
