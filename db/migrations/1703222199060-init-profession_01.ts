import { MigrationInterface, QueryRunner } from "typeorm";

export class InitProfession011703222199060 implements MigrationInterface {
    name = 'InitProfession011703222199060'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "professional" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "DNI" character varying, "lastName" character varying NOT NULL, "name" character varying NOT NULL, "email" character varying NOT NULL, "avatar" character varying(300), "description" text, "password" character varying NOT NULL, "score" double precision DEFAULT '1', "roles" "public"."professional_roles_enum" NOT NULL DEFAULT 'professional', "state" "public"."professional_state_enum" NOT NULL DEFAULT 'avalible', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_2846b0dcaac01f9983cb719f124" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "profession" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying(300), CONSTRAINT "PK_7a54f88e18eaeb628aef171dc52" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "professional_professions_profession" ("professionalId" uuid NOT NULL, "professionId" uuid NOT NULL, CONSTRAINT "PK_8545fd10f5ffeeb22d0bc141234" PRIMARY KEY ("professionalId", "professionId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_77ac9308ad1a012545c1917938" ON "professional_professions_profession" ("professionalId") `);
        await queryRunner.query(`CREATE INDEX "IDX_c5c9a4e70d75c40a98225422fb" ON "professional_professions_profession" ("professionId") `);
        await queryRunner.query(`CREATE TABLE "profession_professionals_professional" ("professionId" uuid NOT NULL, "professionalId" uuid NOT NULL, CONSTRAINT "PK_d2c97cf627c1533e3e8a5efbe8b" PRIMARY KEY ("professionId", "professionalId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d6f6c25032113feadfd773d58b" ON "profession_professionals_professional" ("professionId") `);
        await queryRunner.query(`CREATE INDEX "IDX_cfbee5a7aa7e3cec7ce9751474" ON "profession_professionals_professional" ("professionalId") `);
        await queryRunner.query(`ALTER TABLE "professional_professions_profession" ADD CONSTRAINT "FK_77ac9308ad1a012545c1917938d" FOREIGN KEY ("professionalId") REFERENCES "professional"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "professional_professions_profession" ADD CONSTRAINT "FK_c5c9a4e70d75c40a98225422fbc" FOREIGN KEY ("professionId") REFERENCES "profession"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "profession_professionals_professional" ADD CONSTRAINT "FK_d6f6c25032113feadfd773d58b0" FOREIGN KEY ("professionId") REFERENCES "profession"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "profession_professionals_professional" ADD CONSTRAINT "FK_cfbee5a7aa7e3cec7ce97514744" FOREIGN KEY ("professionalId") REFERENCES "professional"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profession_professionals_professional" DROP CONSTRAINT "FK_cfbee5a7aa7e3cec7ce97514744"`);
        await queryRunner.query(`ALTER TABLE "profession_professionals_professional" DROP CONSTRAINT "FK_d6f6c25032113feadfd773d58b0"`);
        await queryRunner.query(`ALTER TABLE "professional_professions_profession" DROP CONSTRAINT "FK_c5c9a4e70d75c40a98225422fbc"`);
        await queryRunner.query(`ALTER TABLE "professional_professions_profession" DROP CONSTRAINT "FK_77ac9308ad1a012545c1917938d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cfbee5a7aa7e3cec7ce9751474"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d6f6c25032113feadfd773d58b"`);
        await queryRunner.query(`DROP TABLE "profession_professionals_professional"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c5c9a4e70d75c40a98225422fb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_77ac9308ad1a012545c1917938"`);
        await queryRunner.query(`DROP TABLE "professional_professions_profession"`);
        await queryRunner.query(`DROP TABLE "profession"`);
        await queryRunner.query(`DROP TABLE "professional"`);
    }

}
