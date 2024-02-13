import { ApiProperty } from '@nestjs/swagger';
import { ActivityEntity } from 'src/modules/activity/entities/activity.entity';
import { ConsultationEntity } from 'src/modules/consultation/entities/consultation.entity';
import { ProfessionalEntity } from 'src/modules/professional/entities/professional.entity';

import { Entity, Column, PrimaryGeneratedColumn, OneToMany, ManyToMany, JoinTable } from 'typeorm';

@Entity({ name: 'profession' })
export class ProfessionEntity {
  @ApiProperty({ example: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Software Developer', required: true })
  @Column()
  name: string;

  @ApiProperty({ example: 'Description of the profession', required: false })
  @Column({ length: 300, nullable: true })
  description: string;

  @ApiProperty({ type: () => [ProfessionalEntity], required: false })
  @ManyToMany(() => ProfessionalEntity, professional => professional.professions)
  @JoinTable()
  professionals: ProfessionalEntity[];

  @ApiProperty({ type: () => [ActivityEntity], required: false })
  @OneToMany(() => ActivityEntity, activity => activity.profession)
  activities: ActivityEntity[];

}
