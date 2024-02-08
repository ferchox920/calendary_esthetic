// professional.entity.ts

import { Exclude } from 'class-transformer';
import { ConsultationEntity } from 'src/modules/consultation/entities/consultation.entity';
import { ProfessionEntity } from 'src/modules/profession/entities/profession.entity';
import { ProfesionalStatus } from 'src/utility/common/professional-status.enum';
import { Roles } from 'src/utility/common/roles-enum';
import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, CreateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn, ManyToMany, JoinTable, OneToMany } from 'typeorm';

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

  @Column({ type: 'float', default: 1, nullable: true })
  score: number;

  @Column({ type: 'enum', enum: Roles, default: [Roles.PROFESSIONAL] })
  roles: Roles;

  @Column({
    type: 'enum',
    enum: ProfesionalStatus,
    default: ProfesionalStatus.AVALIBLE,
  })
  state: ProfesionalStatus;

  @OneToMany(() => ConsultationEntity, consultation => consultation.professional)
  consultations: ConsultationEntity[];

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

  @ManyToMany(() => ProfessionEntity)
  @JoinTable()
  professions: ProfessionEntity[];

  constructor(partial: Partial<ProfessionalEntity>) {
    Object.assign(this, partial);
  }
}