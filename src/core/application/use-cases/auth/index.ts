import { OAuthLoginUseCase } from './oauth-login.use-case';
import { LoginUseCase } from './login.use-case';
import { LogoutUseCase } from './logout.use-case';
import { RefreshTokenUseCase } from './refresh-toke.use-case';
import { ForgotPasswordUseCase } from './forgotPassword.useCase';
import { ResetPasswordUseCase } from './resetPassword.useCase';

export const UseCases = [
    LoginUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    OAuthLoginUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
];
