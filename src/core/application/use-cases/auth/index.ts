import { OAuthLoginUseCase } from './oauth-login.use-case';
import { LoginUseCase } from './login.use-case';
import { LogoutUseCase } from './logout.use-case';
import { RefreshTokenUseCase } from './refresh-toke.use-case';
import { ForgotPasswordUseCase } from './forgot-password.use-case';
import { ResetPasswordUseCase } from './reset-password.use-case';

export const UseCases = [
    LoginUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    OAuthLoginUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
];
