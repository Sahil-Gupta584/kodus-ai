import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIssueCreationConfigToParametersEnum1759943958610
    implements MigrationInterface
{
    name = 'AddIssueCreationConfigToParametersEnum1759943958610';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      ALTER TYPE parameters_configkey_enum ADD VALUE IF NOT EXISTS 'issue_creation_config';
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // PostgreSQL does not support removing enum values.
        // To rollback, we have to recreate the enum type manually.
    }
}
