import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1702970156335 implements MigrationInterface {
    name = 'Init1702970156335'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."users_roles_enum" AS ENUM('admin', 'professional', 'user')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(50), "email" character varying(100) NOT NULL, "number" character varying(20), "password" character varying(100), "isVerified" boolean NOT NULL DEFAULT false, "isRegister" boolean NOT NULL DEFAULT false, "deleted" boolean NOT NULL DEFAULT false, "otp" character varying, "otpExpiryTime" date, "addr1" character varying, "addr2" character varying, "city" character varying, "state" character varying, "country" character varying, "zip" numeric, "roles" "public"."users_roles_enum" NOT NULL DEFAULT 'user', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."admin_roles_enum" AS ENUM('admin', 'professional', 'user')`);
        await queryRunner.query(`CREATE TABLE "admin" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "DNI" character varying, "name" character varying NOT NULL, "email" character varying NOT NULL, "avatar" character varying(300), "password" character varying NOT NULL, "roles" "public"."admin_roles_enum" NOT NULL DEFAULT 'admin', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_e032310bcef831fb83101899b10" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."professional_roles_enum" AS ENUM('admin', 'professional', 'user')`);
        await queryRunner.query(`CREATE TYPE "public"."professional_state_enum" AS ENUM('pending', 'needConfirm', 'avalible', 'disavalible')`);
        await queryRunner.query(`CREATE TABLE "professional" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "DNI" character varying, "lastName" character varying NOT NULL, "name" character varying NOT NULL, "email" character varying NOT NULL, "avatar" character varying(300), "description" text, "password" character varying NOT NULL, "refreshToken" character varying, "resetToken" character varying, "score" double precision DEFAULT '1', "roles" "public"."professional_roles_enum" array NOT NULL DEFAULT '{professional}', "state" "public"."professional_state_enum" NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_2846b0dcaac01f9983cb719f124" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "professional"`);
        await queryRunner.query(`DROP TYPE "public"."professional_state_enum"`);
        await queryRunner.query(`DROP TYPE "public"."professional_roles_enum"`);
        await queryRunner.query(`DROP TABLE "admin"`);
        await queryRunner.query(`DROP TYPE "public"."admin_roles_enum"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_roles_enum"`);
    }

}
