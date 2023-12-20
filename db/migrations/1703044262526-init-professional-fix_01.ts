import { MigrationInterface, QueryRunner } from "typeorm";

export class InitProfessionalFix011703044262526 implements MigrationInterface {
    name = 'InitProfessionalFix011703044262526'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."professional_state_enum" RENAME TO "professional_state_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."professional_state_enum" AS ENUM('avalible', 'disavalible', 'pending')`);
        await queryRunner.query(`ALTER TABLE "professional" ALTER COLUMN "state" TYPE "public"."professional_state_enum" USING "state"::"text"::"public"."professional_state_enum"`);
        await queryRunner.query(`ALTER TABLE "professional" ALTER COLUMN "state" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."professional_state_enum_old"`);
        await queryRunner.query(`ALTER TABLE "professional" ALTER COLUMN "state" SET DEFAULT 'pending'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "professional" ALTER COLUMN "state" DROP DEFAULT`);
        await queryRunner.query(`CREATE TYPE "public"."professional_state_enum_old" AS ENUM('pending', 'needConfirm', 'avalible', 'disavalible')`);
        await queryRunner.query(`ALTER TABLE "professional" ALTER COLUMN "state" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "professional" ALTER COLUMN "state" TYPE "public"."professional_state_enum_old" USING "state"::"text"::"public"."professional_state_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."professional_state_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."professional_state_enum_old" RENAME TO "professional_state_enum"`);
    }

}
