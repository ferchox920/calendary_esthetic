// user.entity.ts

import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { ConsultationEntity } from 'src/modules/consultation/entities/consultation.entity';
import { ReviewEntity } from 'src/modules/review/entities/review.entity'; // Asegúrate de importar la entidad ReviewEntity
import { Roles } from 'src/utility/common/roles-enum';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'users' })
export class UserEntity {
  @ApiProperty({ example: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'John Doe', maxLength: 50, required: false })
  @Column('character varying', { name: 'name', length: 50, nullable: true })
  name: string;

  @ApiProperty({ example: 'john@example.com', maxLength: 100, required: true, uniqueItems: true })
  @Column('character varying', { name: 'email', length: 100, nullable: false, unique: true })
  email: string;

  @ApiProperty({ example: '123456789', maxLength: 20, required: false })
  @Column('character varying', { name: 'number', length: 20, nullable: true })
  number: string;

  @ApiProperty({ example: 'password', maxLength: 100, required: false })
  @Column('character varying', { name: 'password', length: 100, nullable: true })
  password: string;

  @ApiProperty({ example: false, required: false })
  @Column('boolean', { name: 'isVerified', default: false })
  isVerified: boolean;

  @ApiProperty({ example: false, required: false })
  @Column('boolean', { name: 'isRegister', default: false })
  isRegister: boolean;

  @ApiProperty({ example: false, required: false })
  @Column('boolean', { name: 'deleted', default: false })
  deleted: boolean;

  @ApiProperty({ example: '1234', required: false })
  @Column('character varying', { name: 'otp', nullable: true })
  otp: string;

  @ApiProperty({ example: '2024-02-10', required: false })
  @Column('date', { name: 'otpExpiryTime', nullable: true })
  otpExpiryTime: Date;

  // ... otras propiedades

  @ApiProperty({ example: 'USER', enum: Roles, default: Roles.USER, required: false })
  @Column({ type: 'enum', enum: Roles, default: Roles.USER })
  roles: Roles;

  @OneToMany(() => ConsultationEntity, (consultation) => consultation.user)
  consultations: ConsultationEntity[];

  @OneToMany(() => ReviewEntity, (review) => review.user) // Relación con la entidad ReviewEntity
  reviews: ReviewEntity[]; // Propiedad para almacenar las revisiones del usuario

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

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}
