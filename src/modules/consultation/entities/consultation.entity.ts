import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { ProfessionalEntity } from 'src/modules/professional/entities/professional.entity';
import { ActivityEntity } from 'src/modules/activity/entities/activity.entity';
import { UserEntity } from 'src/modules/users/entities/users.entity';

@Entity({ name: 'consultation' })
export class ConsultationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  status: string;

  @Column()
  date: string;

  @Column({ type: 'text', nullable: true })
  linkpay: string;

  @ManyToOne(() => ProfessionalEntity, (professional) => professional.consultations)
  professional: ProfessionalEntity;

  @ManyToOne(() => ActivityEntity, (activity) => activity.consultations)
  activity: ActivityEntity;
  
  @ManyToOne(() => UserEntity, (user) => user.consultations)
  user: UserEntity;

  constructor(partial: Partial<ConsultationEntity>) {
    Object.assign(this, partial);
  }
}
