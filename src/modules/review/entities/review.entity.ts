// review.entity.ts

import { ApiProperty } from '@nestjs/swagger';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { ProfessionalEntity } from 'src/modules/professional/entities/professional.entity';
import { UserEntity } from 'src/modules/users/entities/users.entity';
import { ConsultationEntity } from 'src/modules/consultation/entities/consultation.entity';

@Entity({ name: 'review' })
export class ReviewEntity {
  @ApiProperty({ example: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Good service', required: true })
  @Column({ type: 'text', nullable: false })
  comment: string;

  @ApiProperty({ example: 5, required: true })
  @Column({ type: 'int', nullable: false })
  rating: number;

  @ApiProperty({ type: () => ProfessionalEntity, required: true })
  @ManyToOne(() => ProfessionalEntity, (professional) => professional.reviews)
  professional: ProfessionalEntity;

  @ApiProperty({ type: () => UserEntity, required: true })
  @ManyToOne(() => UserEntity, (user) => user.reviews)
  user: UserEntity;

  @ApiProperty({ type: () => ConsultationEntity, required: true })
  @ManyToOne(() => ConsultationEntity, (consultation) => consultation.reviews)
  consultation: ConsultationEntity;

  constructor(partial: Partial<ReviewEntity>) {
    Object.assign(this, partial);
  }
}
