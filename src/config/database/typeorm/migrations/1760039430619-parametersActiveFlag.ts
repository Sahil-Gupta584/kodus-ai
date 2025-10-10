import { MigrationInterface, QueryRunner } from "typeorm";

export class ParametersActiveFlag1760039430619 implements MigrationInterface {
    name = 'ParametersActiveFlag1760039430619'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "parameters"
            ADD "active" boolean NOT NULL DEFAULT true
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "parameters" DROP COLUMN "active"
        `);
    }

}
