import { MigrationInterface, QueryRunner } from "typeorm";

export class InitActivity021704503652900 implements MigrationInterface {
    name = 'InitActivity021704503652900'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "activity" ADD "price" numeric(10,2) NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "activity" DROP COLUMN "price"`);
    }

}
