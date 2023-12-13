import { Exclude } from 'class-transformer';
import { Roles } from 'src/utility/commons/roles-enum';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Timestamp,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('character varying', {
    name: 'name',
    length: 50,
    nullable: true,
  })
  name: string;

  @Column('character varying', {
    name: 'email',
    length: 100,
    nullable: false,
    unique: true,
  })
  email: string;

  @Column('character varying', {
    name: 'number',
    length: 20,
    nullable: true,
  })
  number: string;

  @Column('character varying', {
    name: 'password',
    length: 100,
    nullable: true,
  })
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

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}
