import { Roles } from 'src/utility/commons/roles-enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Timestamp,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column('character varying', {
    name: 'number',
    length: 20,
    nullable: true,
  })
  number: string;

  @Column({ select: false })
  password: string;

  @Column('boolean', {
    name: 'isVerified',
    default: false,
  })
  isVerified: boolean;

  @Column('boolean', {
    name: 'isRegister',
    default: false,
  })
  isRegister: boolean;

  @Column('boolean', {
    name: 'deleted',
    default: false,
  })
  deleted: boolean;

  @Column('character varying', {
    name: 'otp',
    nullable: true,
  })
  otp: string;

  @Column('date', {
    name: 'otpExpiryTime',
    nullable: true,
  })
  otpExpiryTime: Date;

  @Column('character varying', {
    name: 'addr1',
    nullable: true,
  })
  addr1: string;

  @Column('character varying', {
    name: 'addr2',
    nullable: true,
  })
  addr2: string;

  @Column('character varying', {
    name: 'city',
    nullable: true,
  })
  city: string;

  @Column('character varying', {
    name: 'state',
    nullable: true,
  })
  state: string;

  @Column('character varying', {
    name: 'country',
    nullable: true,
  })
  country: string;

  @Column('numeric', {
    name: 'zip',
    nullable: true,
  })
  zip: number;

  @Column({ type: 'enum', enum: Roles, array: true, default: [Roles.USER] })
  roles: Roles[];

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Timestamp;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP(6)',
    onUpdate: 'CURRENT_TIMESTAMP(6)',
  })
  updatedAt: Timestamp;
}
