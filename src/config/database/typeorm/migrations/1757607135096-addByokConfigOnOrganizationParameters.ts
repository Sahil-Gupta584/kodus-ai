import { MigrationInterface, QueryRunner } from "typeorm";

export class AddByokConfigOnOrganizationParameters1757607135096 implements MigrationInterface {
    name = 'AddByokConfigOnOrganizationParameters1757607135096'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TYPE "public"."organization_parameters_configkey_enum"
            RENAME TO "organization_parameters_configkey_enum_old"
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."organization_parameters_configkey_enum" AS ENUM(
                'category_workitems_type',
                'timezone_config',
                'review_mode_config',
                'kody_fine_tuning_config',
                'auto_join_config',
                'byok_config'
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "organization_parameters"
            ALTER COLUMN "configKey" TYPE "public"."organization_parameters_configkey_enum" USING "configKey"::"text"::"public"."organization_parameters_configkey_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."organization_parameters_configkey_enum_old"
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."organization_parameters_configkey_enum_old" AS ENUM(
                'auto_join_config',
                'category_workitems_type',
                'kody_fine_tuning_config',
                'review_mode_config',
                'timezone_config'
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "organization_parameters"
            ALTER COLUMN "configKey" TYPE "public"."organization_parameters_configkey_enum_old" USING "configKey"::"text"::"public"."organization_parameters_configkey_enum_old"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."organization_parameters_configkey_enum"
        `);
        await queryRunner.query(`
            ALTER TYPE "public"."organization_parameters_configkey_enum_old"
            RENAME TO "organization_parameters_configkey_enum"
        `);
    }

}
