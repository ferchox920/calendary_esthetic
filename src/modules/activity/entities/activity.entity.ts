import { ProfessionEntity } from 'src/modules/profession/entities/profession.entity';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';

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

  @ManyToOne(() => ProfessionEntity, profession => profession.activities)
  profession: ProfessionEntity;
}
