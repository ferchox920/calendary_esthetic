import { MigrationInterface, QueryRunner } from "typeorm";

export class InitProfessional1703043554314 implements MigrationInterface {
    name = 'InitProfessional1703043554314'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "professional" DROP COLUMN "refreshToken"`);
        await queryRunner.query(`ALTER TABLE "professional" DROP COLUMN "resetToken"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "professional" ADD "resetToken" character varying`);
        await queryRunner.query(`ALTER TABLE "professional" ADD "refreshToken" character varying`);
    }

}
