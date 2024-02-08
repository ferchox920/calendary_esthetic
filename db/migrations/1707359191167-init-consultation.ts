import { MigrationInterface, QueryRunner } from "typeorm";

export class InitConsultation1707359191167 implements MigrationInterface {
    name = 'InitConsultation1707359191167'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."admin_roles_enum" AS ENUM('admin', 'professional', 'user')`);
        await queryRunner.query(`CREATE TABLE "admin" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "DNI" character varying, "name" character varying NOT NULL, "email" character varying NOT NULL, "avatar" character varying(300), "password" character varying NOT NULL, "roles" "public"."admin_roles_enum" NOT NULL DEFAULT 'admin', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_e032310bcef831fb83101899b10" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "profession" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying(300), CONSTRAINT "PK_7a54f88e18eaeb628aef171dc52" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."professional_roles_enum" AS ENUM('admin', 'professional', 'user')`);
        await queryRunner.query(`CREATE TYPE "public"."professional_state_enum" AS ENUM('avalible', 'disavalible')`);
        await queryRunner.query(`CREATE TABLE "professional" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "DNI" character varying, "lastName" character varying NOT NULL, "name" character varying NOT NULL, "email" character varying NOT NULL, "avatar" character varying(300), "description" text, "password" character varying NOT NULL, "score" double precision DEFAULT '1', "roles" "public"."professional_roles_enum" NOT NULL DEFAULT 'professional', "state" "public"."professional_state_enum" NOT NULL DEFAULT 'avalible', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_2846b0dcaac01f9983cb719f124" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_roles_enum" AS ENUM('admin', 'professional', 'user')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(50), "email" character varying(100) NOT NULL, "number" character varying(20), "password" character varying(100), "isVerified" boolean NOT NULL DEFAULT false, "isRegister" boolean NOT NULL DEFAULT false, "deleted" boolean NOT NULL DEFAULT false, "otp" character varying, "otpExpiryTime" date, "addr1" character varying, "addr2" character varying, "city" character varying, "state" character varying, "country" character varying, "zip" numeric, "roles" "public"."users_roles_enum" NOT NULL DEFAULT 'user', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "consultation" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" character varying NOT NULL, "date" character varying NOT NULL, "linkpay" text, "professionalId" uuid, "userId" uuid, "activityId" uuid, CONSTRAINT "PK_5203569fac28a4a626c42abe70b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "activity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying(500), "price" numeric(10,2) NOT NULL DEFAULT '0', "professionId" uuid, CONSTRAINT "PK_24625a1d6b1b089c8ae206fe467" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "profession_professionals_professional" ("professionId" uuid NOT NULL, "professionalId" uuid NOT NULL, CONSTRAINT "PK_d2c97cf627c1533e3e8a5efbe8b" PRIMARY KEY ("professionId", "professionalId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d6f6c25032113feadfd773d58b" ON "profession_professionals_professional" ("professionId") `);
        await queryRunner.query(`CREATE INDEX "IDX_cfbee5a7aa7e3cec7ce9751474" ON "profession_professionals_professional" ("professionalId") `);
        await queryRunner.query(`CREATE TABLE "professional_professions_profession" ("professionalId" uuid NOT NULL, "professionId" uuid NOT NULL, CONSTRAINT "PK_8545fd10f5ffeeb22d0bc141234" PRIMARY KEY ("professionalId", "professionId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_77ac9308ad1a012545c1917938" ON "professional_professions_profession" ("professionalId") `);
        await queryRunner.query(`CREATE INDEX "IDX_c5c9a4e70d75c40a98225422fb" ON "professional_professions_profession" ("professionId") `);
        await queryRunner.query(`ALTER TABLE "consultation" ADD CONSTRAINT "FK_0fe9dfc52151511a7672aaf0ad3" FOREIGN KEY ("professionalId") REFERENCES "professional"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "consultation" ADD CONSTRAINT "FK_5fdef95bb1290b8daff57fa3b4b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "consultation" ADD CONSTRAINT "FK_433a47ff81d0c8ea20d6c925a92" FOREIGN KEY ("activityId") REFERENCES "activity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "activity" ADD CONSTRAINT "FK_64bd737710dfe12f50d45db213f" FOREIGN KEY ("professionId") REFERENCES "profession"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "profession_professionals_professional" ADD CONSTRAINT "FK_d6f6c25032113feadfd773d58b0" FOREIGN KEY ("professionId") REFERENCES "profession"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "profession_professionals_professional" ADD CONSTRAINT "FK_cfbee5a7aa7e3cec7ce97514744" FOREIGN KEY ("professionalId") REFERENCES "professional"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "professional_professions_profession" ADD CONSTRAINT "FK_77ac9308ad1a012545c1917938d" FOREIGN KEY ("professionalId") REFERENCES "professional"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "professional_professions_profession" ADD CONSTRAINT "FK_c5c9a4e70d75c40a98225422fbc" FOREIGN KEY ("professionId") REFERENCES "profession"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "professional_professions_profession" DROP CONSTRAINT "FK_c5c9a4e70d75c40a98225422fbc"`);
        await queryRunner.query(`ALTER TABLE "professional_professions_profession" DROP CONSTRAINT "FK_77ac9308ad1a012545c1917938d"`);
        await queryRunner.query(`ALTER TABLE "profession_professionals_professional" DROP CONSTRAINT "FK_cfbee5a7aa7e3cec7ce97514744"`);
        await queryRunner.query(`ALTER TABLE "profession_professionals_professional" DROP CONSTRAINT "FK_d6f6c25032113feadfd773d58b0"`);
        await queryRunner.query(`ALTER TABLE "activity" DROP CONSTRAINT "FK_64bd737710dfe12f50d45db213f"`);
        await queryRunner.query(`ALTER TABLE "consultation" DROP CONSTRAINT "FK_433a47ff81d0c8ea20d6c925a92"`);
        await queryRunner.query(`ALTER TABLE "consultation" DROP CONSTRAINT "FK_5fdef95bb1290b8daff57fa3b4b"`);
        await queryRunner.query(`ALTER TABLE "consultation" DROP CONSTRAINT "FK_0fe9dfc52151511a7672aaf0ad3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c5c9a4e70d75c40a98225422fb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_77ac9308ad1a012545c1917938"`);
        await queryRunner.query(`DROP TABLE "professional_professions_profession"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cfbee5a7aa7e3cec7ce9751474"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d6f6c25032113feadfd773d58b"`);
        await queryRunner.query(`DROP TABLE "profession_professionals_professional"`);
        await queryRunner.query(`DROP TABLE "activity"`);
        await queryRunner.query(`DROP TABLE "consultation"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_roles_enum"`);
        await queryRunner.query(`DROP TABLE "professional"`);
        await queryRunner.query(`DROP TYPE "public"."professional_state_enum"`);
        await queryRunner.query(`DROP TYPE "public"."professional_roles_enum"`);
        await queryRunner.query(`DROP TABLE "profession"`);
        await queryRunner.query(`DROP TABLE "admin"`);
        await queryRunner.query(`DROP TYPE "public"."admin_roles_enum"`);
    }

}
