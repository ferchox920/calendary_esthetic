import { MigrationInterface, QueryRunner } from "typeorm";

export class InitActivity011704502009627 implements MigrationInterface {
    name = 'InitActivity011704502009627'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "activity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying(500), "professionId" uuid, CONSTRAINT "PK_24625a1d6b1b089c8ae206fe467" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TYPE "public"."professional_state_enum" RENAME TO "professional_state_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."professional_state_enum" AS ENUM('avalible', 'disavalible')`);
        await queryRunner.query(`ALTER TABLE "professional" ALTER COLUMN "state" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "professional" ALTER COLUMN "state" TYPE "public"."professional_state_enum" USING "state"::"text"::"public"."professional_state_enum"`);
        await queryRunner.query(`ALTER TABLE "professional" ALTER COLUMN "state" SET DEFAULT 'avalible'`);
        await queryRunner.query(`DROP TYPE "public"."professional_state_enum_old"`);
        await queryRunner.query(`ALTER TABLE "activity" ADD CONSTRAINT "FK_64bd737710dfe12f50d45db213f" FOREIGN KEY ("professionId") REFERENCES "profession"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "activity" DROP CONSTRAINT "FK_64bd737710dfe12f50d45db213f"`);
        await queryRunner.query(`CREATE TYPE "public"."professional_state_enum_old" AS ENUM('avalible', 'disavalible', 'pending')`);
        await queryRunner.query(`ALTER TABLE "professional" ALTER COLUMN "state" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "professional" ALTER COLUMN "state" TYPE "public"."professional_state_enum_old" USING "state"::"text"::"public"."professional_state_enum_old"`);
        await queryRunner.query(`ALTER TABLE "professional" ALTER COLUMN "state" SET DEFAULT 'avalible'`);
        await queryRunner.query(`DROP TYPE "public"."professional_state_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."professional_state_enum_old" RENAME TO "professional_state_enum"`);
        await queryRunner.query(`DROP TABLE "activity"`);
    }

}
