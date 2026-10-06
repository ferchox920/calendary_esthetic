import { MigrationInterface, QueryRunner } from 'typeorm';

export class OwnerAccount1791298800000 implements MigrationInterface {
  name = 'OwnerAccount1791298800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "owner_account" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "singleton" boolean NOT NULL DEFAULT true UNIQUE,
      "email" varchar NOT NULL UNIQUE,
      "name" varchar NOT NULL DEFAULT 'Gabriela',
      "passwordHash" varchar NOT NULL,
      "active" boolean NOT NULL DEFAULT true,
      "sessionVersion" integer NOT NULL DEFAULT 1,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "owner_singleton_true" CHECK (singleton = true),
      CONSTRAINT "owner_version_positive" CHECK ("sessionVersion" >= 1)
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "owner_account"');
  }
}
