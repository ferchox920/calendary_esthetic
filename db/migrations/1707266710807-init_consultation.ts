import { MigrationInterface, QueryRunner } from "typeorm";

export class InitConsultation1707266710807 implements MigrationInterface {
    name = 'InitConsultation1707266710807'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "consultation" DROP COLUMN "price"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "consultation" ADD "price" character varying NOT NULL`);
    }

}
