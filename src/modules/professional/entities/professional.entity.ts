// professional.entity.ts

import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { ConsultationEntity } from 'src/modules/consultation/entities/consultation.entity';
import { ProfessionEntity } from 'src/modules/profession/entities/profession.entity';
import { ProfesionalStatus } from 'src/utility/common/professional-status.enum';
import { Roles } from 'src/utility/common/roles-enum';
import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, CreateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import { ReviewEntity } from 'src/modules/review/entities/review.entity'; // Asegúrate de importar la entidad ReviewEntity

@Entity({ name: 'professional' })
export class ProfessionalEntity {
  @ApiProperty({ example: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: '123456789', required: false })
  @Column({ nullable: true })
  DNI: string;

  @ApiProperty({ example: 'Doe', required: true })
  @Column()
  lastName: string;

  @ApiProperty({ example: 'John', required: true })
  @Column()
  name: string;

  @ApiProperty({ example: 'john.doe@example.com', required: true })
  @Column()
  email: string;

  @ApiProperty({ example: 'avatar-url', required: false })
  @Column({ length: 300, nullable: true })
  avatar: string;

  @ApiProperty({ example: 'Professional description', required: false })
  @Column('text', { nullable: true })
  description: string;

  @ApiProperty({ example: 'password', required: false })
  @Column()
  password: string;

  @ApiProperty({ example: 1, required: false })
  @Column({ type: 'float', default: 1, nullable: true })
  score: number;

  @ApiProperty({ enum: Roles, default: [Roles.PROFESSIONAL], required: false })
  @Column({ type: 'enum', enum: Roles, default: [Roles.PROFESSIONAL] })
  roles: Roles;

  @ApiProperty({ enum: ProfesionalStatus, default: ProfesionalStatus.AVALIBLE, required: false })
  @Column({
    type: 'enum',
    enum: ProfesionalStatus,
    default: ProfesionalStatus.AVALIBLE,
  })
  state: ProfesionalStatus;

  @OneToMany(() => ConsultationEntity, consultation => consultation.professional)
  consultations: ConsultationEntity[];

  @OneToMany(() => ReviewEntity, (review) => review.professional) // Relación con ReviewEntity
  reviews: ReviewEntity[]; // Propiedad para almacenar las revisiones asociadas a este profesional

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

  @ApiProperty({ type: () => [ProfessionEntity], required: false })
  @ManyToMany(() => ProfessionEntity)
  @JoinTable()
  professions: ProfessionEntity[];

  constructor(partial: Partial<ProfessionalEntity>) {
    Object.assign(this, partial);
  }
}
