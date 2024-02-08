import { MigrationInterface, QueryRunner } from "typeorm";

export class InitConsultation031707364041292 implements MigrationInterface {
    name = 'InitConsultation031707364041292'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "consultation" DROP CONSTRAINT "FK_5fdef95bb1290b8daff57fa3b4b"`);
        await queryRunner.query(`ALTER TABLE "consultation" DROP COLUMN "userId"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "consultation" ADD "userId" uuid`);
        await queryRunner.query(`ALTER TABLE "consultation" ADD CONSTRAINT "FK_5fdef95bb1290b8daff57fa3b4b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
