// professional.entity.ts

import { Exclude } from 'class-transformer';
import { Roles } from 'src/utility/common/roles-enum';
import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, CreateDateColumn, DeleteDateColumn } from 'typeorm';

@Entity({ name: 'professional' })
export class ProfessionalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  DNI: string;

  @Column()
  lastName: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column({ length: 300, nullable: true })
  avatar: string;

  @Column('text', { nullable: true })
  description: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  refreshToken: string;

  @Column({ nullable: true })
  resetToken: string;

  @Column({ type: 'float', default: 1, nullable: true })
  score: number;

  @Column({ type: 'enum', enum: Roles, array: true, default: [Roles.PROFESSIONAL] })
  roles: Roles[];

  @Column({
    type: 'enum',
    enum: ['pending', 'needConfirm', 'avalible', 'disavalible'],
  })
  state: string;

  @Exclude()
  @CreateDateColumn({
    type: 'timestamptz',
    name: 'createdAt',
    default: () => `now()`,
    onUpdate: `now()`,
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    name: 'updatedAt',
    default: () => `now()`,
    onUpdate: `now()`,
  })
  updatedAt: Date;

  @Exclude()
  @DeleteDateColumn({
    type: 'timestamptz',
    name: 'deletedAt',
    onUpdate: `now()`,
  })
  deletedAt?: Date;

  constructor(partial: Partial<ProfessionalEntity>) {
    Object.assign(this, partial);
  }
}
