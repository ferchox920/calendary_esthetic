import { MigrationInterface, QueryRunner } from "typeorm";

export class Initializate1701230098363 implements MigrationInterface {
    name = 'Initializate1701230098363'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."professional_roles_enum" AS ENUM('admin', 'professional', 'user')`);
        await queryRunner.query(`CREATE TYPE "public"."professional_state_enum" AS ENUM('pending', 'needConfirm', 'avalible', 'disavalible')`);
        await queryRunner.query(`CREATE TABLE "professional" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "DNI" character varying, "lastName" character varying NOT NULL, "name" character varying NOT NULL, "email" character varying NOT NULL, "avatar" character varying(300), "description" text, "password" character varying NOT NULL, "refreshToken" character varying, "resetToken" character varying, "score" double precision DEFAULT '1', "roles" "public"."professional_roles_enum" array NOT NULL DEFAULT '{professional}', "state" "public"."professional_state_enum" NOT NULL, CONSTRAINT "PK_2846b0dcaac01f9983cb719f124" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "email" character varying NOT NULL, "number" character varying(20), "password" character varying NOT NULL, "isVerified" boolean NOT NULL DEFAULT false, "isRegister" boolean NOT NULL DEFAULT false, "deleted" boolean NOT NULL DEFAULT false, "otp" character varying, "otpExpiryTime" date, "addr1" character varying, "addr2" character varying, "city" character varying, "state" character varying, "country" character varying, "zip" numeric, "roles" "public"."users_roles_enum" array NOT NULL DEFAULT '{user}', "createdAt" TIMESTAMP NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone, "updatedAt" TIMESTAMP NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "professional"`);
        await queryRunner.query(`DROP TYPE "public"."professional_state_enum"`);
        await queryRunner.query(`DROP TYPE "public"."professional_roles_enum"`);
    }

}
