import { MigrationInterface, QueryRunner } from "typeorm";

export class InitConsultation011707276036928 implements MigrationInterface {
    name = 'InitConsultation011707276036928'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "consultation" ADD "activityId" uuid`);
        await queryRunner.query(`ALTER TABLE "consultation" ADD CONSTRAINT "FK_433a47ff81d0c8ea20d6c925a92" FOREIGN KEY ("activityId") REFERENCES "activity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "consultation" DROP CONSTRAINT "FK_433a47ff81d0c8ea20d6c925a92"`);
        await queryRunner.query(`ALTER TABLE "consultation" DROP COLUMN "activityId"`);
    }

}
