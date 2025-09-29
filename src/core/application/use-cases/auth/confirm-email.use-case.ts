import {
    Inject,
    Injectable,
    UnauthorizedException,
    InternalServerErrorException,
} from '@nestjs/common';
import {
    AUTH_SERVICE_TOKEN,
    IAuthService,
} from '@/core/domain/auth/contracts/auth.service.contracts';
import {
    IUsersService,
    USER_SERVICE_TOKEN,
} from '@/core/domain/user/contracts/user.service.contract';
import { STATUS } from '@/config/types/database/status.type';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';

interface DecodedPayload {
    readonly email: string;
}

@Injectable()
export class ConfirmEmailUseCase {
    constructor(
        @Inject(AUTH_SERVICE_TOKEN)
        private readonly authService: IAuthService,
        @Inject(USER_SERVICE_TOKEN)
        private readonly usersService: IUsersService,
        private readonly logger: PinoLoggerService,
    ) {}

    async execute(token: string): Promise<{ message: string }> {
        try {
            const decoded: DecodedPayload =
                await this.authService.verifyEmailToken(token);
            if (!decoded?.email) {
                throw new UnauthorizedException(
                    'Token does not contain user email',
                );
            }

            const user = await this.usersService.findOne({
                email: decoded.email,
            });

            if (!user) {
                throw new UnauthorizedException('User not found');
            }

            if (user.status === STATUS.ACTIVE) {
                return { message: 'Email already confirmed' };
            }

            await this.usersService.update(
                { email: decoded.email },
                { status: STATUS.ACTIVE },
            );

            return { message: 'Email confirmed successfully' };
        } catch (error) {
            this.logger.error({
                message: 'Something went wrong while confirming email',
                context: ConfirmEmailUseCase.name,
                error,
            });
            throw new InternalServerErrorException(
                'Something went wrong while confirming email',
            );
        }
    }
}
