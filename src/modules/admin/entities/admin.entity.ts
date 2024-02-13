import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Roles } from 'src/utility/common/roles-enum';
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

@Entity({ name: 'admin' })
export class AdminEntity {
  @ApiProperty({ example: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: '123456789', required: false })
  @Column({ nullable: true })
  DNI: string;

  @ApiProperty({ example: 'John Doe', required: true })
  @Column()
  name: string;

  @ApiProperty({ example: 'john@example.com', required: true })
  @Column()
  email: string;

  @ApiProperty({ example: 'avatar-url', required: false })
  @Column({ length: 300, nullable: true })
  avatar: string;

  @ApiProperty({ example: 'password', required: false })
  @Column()
  password: string;

  @ApiProperty({ enum: Roles, default: Roles.ADMIN, required: false })
  @Column({ type: 'enum', enum: Roles, default: Roles.ADMIN })
  roles: Roles;

  @Exclude()
  @CreateDateColumn({
    type: 'timestamptz',
    name: 'createdAt',
    default: () => `now()`,
    onUpdate: `now()`,
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    name: 'updatedAt',
    default: () => `now()`,
    onUpdate: `now()`,
  })
  updatedAt: Date;

  @Exclude()
  @DeleteDateColumn({
    type: 'timestamptz',
    name: 'deletedAt',
    onUpdate: `now()`,
  })
  deletedAt?: Date;

  constructor(partial: Partial<AdminEntity>) {
    Object.assign(this, partial);
  }
}
