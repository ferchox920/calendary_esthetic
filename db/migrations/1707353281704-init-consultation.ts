import { MigrationInterface, QueryRunner } from "typeorm";

export class InitConsultation1707353281704 implements MigrationInterface {
    name = 'InitConsultation1707353281704'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "consultation" RENAME COLUMN "price" TO "activityId"`);
        await queryRunner.query(`ALTER TABLE "consultation" DROP COLUMN "activityId"`);
        await queryRunner.query(`ALTER TABLE "consultation" ADD "activityId" uuid`);
        await queryRunner.query(`ALTER TABLE "consultation" ADD CONSTRAINT "FK_433a47ff81d0c8ea20d6c925a92" FOREIGN KEY ("activityId") REFERENCES "activity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "consultation" DROP CONSTRAINT "FK_433a47ff81d0c8ea20d6c925a92"`);
        await queryRunner.query(`ALTER TABLE "consultation" DROP COLUMN "activityId"`);
        await queryRunner.query(`ALTER TABLE "consultation" ADD "activityId" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "consultation" RENAME COLUMN "activityId" TO "price"`);
    }

}
