import { ApiProperty } from '@nestjs/swagger';
import { ConsultationEntity } from 'src/modules/consultation/entities/consultation.entity';
import { ProfessionEntity } from 'src/modules/profession/entities/profession.entity';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity({ name: 'activity' })
export class ActivityEntity {
  @ApiProperty({ example: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Programming Task', required: true })
  @Column()
  name: string;

  @ApiProperty({ example: 'Description of the activity', required: false })
  @Column({ length: 500, nullable: true })
  description: string;

  @ApiProperty({ example: 50.99, required: false })
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.0 })
  price: number;

  @ApiProperty({ type: () => ProfessionEntity, required: false })
  @ManyToOne(() => ProfessionEntity, (profession) => profession.activities)
  profession: ProfessionEntity;

  @ApiProperty({ type: () => [ConsultationEntity], required: false })
  @OneToMany(() => ConsultationEntity, (consultation) => consultation.activity)
  consultations: ConsultationEntity[];
}

