import { ChannelCredentials, credentials } from '@grpc/grpc-js';
import * as fs from 'fs';
import { ClientProviderOptions, Transport } from '@nestjs/microservices';
import { resolve } from 'path';
import { cwd } from 'process';

function buildGrpcCredentials(): ChannelCredentials {
    const caPath = resolve(cwd(), 'certs/ca_cert.pem');
    if (fs.existsSync(caPath)) {
        const rootCa = fs.readFileSync(caPath);
        return credentials.createSsl(rootCa);
    }
    return credentials.createInsecure();
}

export const TASK_MICROSERVICE_OPTIONS: ClientProviderOptions = {
    name: 'TASK_MICROSERVICE',
    transport: Transport.GRPC,
    options: {
        package: 'kodus.task.v1',
        protoPath: resolve(
            cwd(),
            'node_modules/@kodus/kodus-proto/kodus/task/v1/manager.proto',
        ),
        url: process.env.SERVICE_TASK_URL ?? null,
        loader: {
            includeDirs: [resolve(cwd(), 'node_modules/@kodus/kodus-proto')],
        },
        credentials: buildGrpcCredentials(),
    },
};
