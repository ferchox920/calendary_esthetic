import { ConsultationEntity } from 'src/modules/consultation/entities/consultation.entity';
import { ProfessionEntity } from 'src/modules/profession/entities/profession.entity';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity({ name: 'activity' })
export class ActivityEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ length: 500, nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.0 })
  price: number;

  @ManyToOne(() => ProfessionEntity, (profession) => profession.activities)
  profession: ProfessionEntity;

  @OneToMany(() => ConsultationEntity, (consultation) => consultation.activity)
  consultations: ConsultationEntity[];
}
