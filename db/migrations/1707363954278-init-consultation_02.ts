import { MigrationInterface, QueryRunner } from "typeorm";

export class InitConsultation021707363954278 implements MigrationInterface {
    name = 'InitConsultation021707363954278'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "professional_professions_profession" DROP CONSTRAINT "FK_c5c9a4e70d75c40a98225422fbc"`);
        await queryRunner.query(`ALTER TABLE "professional_professions_profession" ADD CONSTRAINT "FK_c5c9a4e70d75c40a98225422fbc" FOREIGN KEY ("professionId") REFERENCES "profession"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "professional_professions_profession" DROP CONSTRAINT "FK_c5c9a4e70d75c40a98225422fbc"`);
        await queryRunner.query(`ALTER TABLE "professional_professions_profession" ADD CONSTRAINT "FK_c5c9a4e70d75c40a98225422fbc" FOREIGN KEY ("professionId") REFERENCES "profession"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
