import { Exclude } from 'class-transformer';
import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('owner_account')
@Check('owner_singleton_true', 'singleton = true')
@Check('owner_version_positive', '"sessionVersion" >= 1')
export class OwnerAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'boolean', default: true, unique: true })
  singleton: boolean;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar', default: 'Gabriela' })
  name: string;

  @Exclude()
  @Column({ type: 'varchar', select: false })
  passwordHash: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Exclude()
  @Column({ type: 'integer', default: 1 })
  sessionVersion: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
