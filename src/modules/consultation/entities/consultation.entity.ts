import { ProfessionalEntity } from 'src/modules/professional/entities/professional.entity';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';

@Entity({ name: 'consultation' })
export class ConsultationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  price: string;

  @Column()
  status: string;

  @Column()
  date: string;

  @Column({ type: 'text', nullable: true })
  linkpay: string;

  @ManyToOne(() => ProfessionalEntity, professional => professional.consultations)
  professional: ProfessionalEntity;
}
