// profession.entity.ts
import { ActivityEntity } from 'src/modules/activity/entities/activity.entity';
import { ConsultationEntity } from 'src/modules/consultation/entities/consultation.entity';
import { ProfessionalEntity } from 'src/modules/professional/entities/professional.entity';

import { Entity, Column, PrimaryGeneratedColumn, OneToMany, ManyToMany, JoinTable } from 'typeorm';

@Entity({ name: 'profession' })
export class ProfessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ length: 300, nullable: true })
  description: string;

  @ManyToMany(() => ProfessionalEntity, professional => professional.professions)
  @JoinTable()
  professionals: ProfessionalEntity[];

  @OneToMany(() => ActivityEntity, activity => activity.profession)  
  activities: ActivityEntity[];

}
