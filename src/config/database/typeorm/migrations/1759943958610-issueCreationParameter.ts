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
        const deletedRows = await queryRunner.query(`
            DELETE FROM parameters 
            WHERE "configKey" = 'issue_creation_config'
            RETURNING *;
        `);

        console.log(`No. Rows deleted: ${deletedRows.length}`);

        await queryRunner.query(`
            ALTER TYPE parameters_configkey_enum RENAME TO parameters_configkey_enum_old;
        `);

        const enumValues = await queryRunner.query(`
            SELECT unnest(enum_range(NULL::parameters_configkey_enum_old)) as enum_value;
        `);

        const filteredValues = enumValues
            .map((row: { enum_value: string }) => row.enum_value)
            .filter((value) => value !== 'issue_creation_config')
            .map((value) => `'${value}'`)
            .join(',\n                ');

        await queryRunner.query(`
            CREATE TYPE parameters_configkey_enum AS ENUM (
                ${filteredValues}
            );
        `);

        await queryRunner.query(`
            ALTER TABLE parameters 
            ALTER COLUMN "configKey" TYPE parameters_configkey_enum 
            USING "configKey"::text::parameters_configkey_enum;
        `);

        await queryRunner.query(`
            DROP TYPE parameters_configkey_enum_old;
        `);
    }
}
