import { ApiProperty } from '@nestjs/swagger';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { ProfessionalEntity } from 'src/modules/professional/entities/professional.entity';
import { ActivityEntity } from 'src/modules/activity/entities/activity.entity';
import { UserEntity } from 'src/modules/users/entities/users.entity';

@Entity({ name: 'consultation' })
export class ConsultationEntity {
  @ApiProperty({ example: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Scheduled', required: true })
  @Column()
  status: string;

  @ApiProperty({ example: '2024-02-10T08:00:00', required: true })
  @Column()
  date: string;

  @ApiProperty({ example: 'payment-link', required: false })
  @Column({ type: 'text', nullable: true })
  linkpay: string;

  @ApiProperty({ type: () => ProfessionalEntity, required: false })
  @ManyToOne(() => ProfessionalEntity, (professional) => professional.consultations)
  professional: ProfessionalEntity;

  @ApiProperty({ type: () => ActivityEntity, required: false })
  @ManyToOne(() => ActivityEntity, (activity) => activity.consultations)
  activity: ActivityEntity;
  
  @ApiProperty({ type: () => UserEntity, required: false })
  @ManyToOne(() => UserEntity, (user) => user.consultations)
  user: UserEntity;

  constructor(partial: Partial<ConsultationEntity>) {
    Object.assign(this, partial);
  }
}
