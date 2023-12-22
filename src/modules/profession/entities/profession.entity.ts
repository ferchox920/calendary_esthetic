// profession.entity.ts
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
}
