import { ClientProviderOptions, Transport } from '@nestjs/microservices';
import { resolve } from 'path';
import { cwd } from 'process';
import { credentials } from '@grpc/grpc-js';
import * as fs from 'fs';

export const AST_MICROSERVICE_OPTIONS = {
    name: 'AST_MICROSERVICE',
    transport: Transport.GRPC,
    options: {
        package: 'kodus.ast.v2',
        protoPath: resolve(
            cwd(),
            'node_modules/@kodus/kodus-proto/kodus/ast/v2/analyzer.proto',
        ),
        url: process.env.SERVICE_AST_URL,
        loader: {
            includeDirs: [resolve(cwd(), 'node_modules/@kodus/kodus-proto')],
        },
    },
} as ClientProviderOptions;
