// professional.entity.ts

import { Roles } from 'src/utility/commons/roles-enum';
import {
    Entity,
    Column,
    PrimaryGeneratedColumn,

  } from 'typeorm';

  @Entity({ name: 'professional' })
  export class ProfessionalEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;
  
    @Column({ nullable: true })
    DNI: string;
  
    @Column()
    lastName: string;
  
    @Column()
    name: string;
  
    @Column()
    email: string;
  
    @Column({ length: 300, nullable: true })
    avatar: string;
  
    @Column('text', { nullable: true })
    description: string;
  
    @Column()
    password: string;
  
    @Column({ nullable: true })
    refreshToken: string;
  
    @Column({ nullable: true })
    resetToken: string;
  

    @Column({ type: 'float', default: 1, nullable: true })
    score: number;
  
    @Column({ type: 'enum', enum: Roles, array: true, default: [Roles.PROFESSIONAL] })
    roles: Roles[];
  
    @Column({
      type: 'enum',
      enum: ['pending', 'needConfirm', 'avalible', 'disavalible'],
    })
    state: string;
  

  }
  