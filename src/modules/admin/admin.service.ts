import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminEntity } from './entities/admin.entity';
import { CreateAdminDto } from './dto/create-admin.dto';
import { LoginAdminDto } from './dto/login-admin.dto';
import * as bcrypt from 'bcrypt';
import { Roles } from 'src/utility/common/roles-enum';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AdminEntity)
    private adminRepository: Repository<AdminEntity>
  ) {}

  async findAll(): Promise<AdminEntity[]> {
    return this.adminRepository.find();
  }

  async findOne(id: string): Promise<AdminEntity> {
    return this.adminRepository.findOne({
      where: { id },
    });
  }

  async create(createAdminDto: CreateAdminDto): Promise<AdminEntity> {
    if (createAdminDto.key !== process.env.ADMIN_KEY) {
      throw new Error('Invalid key');
    }

    const existingAdmin = await this.adminRepository.findOne({
      where: { email: createAdminDto.email },
    });

    if (existingAdmin) {
      throw new HttpException('The admin is already registered.', HttpStatus.BAD_REQUEST);
    }
    const hashedPassword = await bcrypt.hash(createAdminDto.password, 10);
    const newAdmin = this.adminRepository.create({
      ...createAdminDto,
      roles: Roles.ADMIN,
      password: hashedPassword,
    });
    return await this.adminRepository.save(newAdmin);
  }

  async login(loginAdminDto: LoginAdminDto) {
    const { email, password } = loginAdminDto;
    if(loginAdminDto.type!= Roles.ADMIN){
      throw new HttpException('Credenciales incorrectas!', HttpStatus.UNAUTHORIZED);
	  }
    try {
      const admin = await this.adminRepository.findOne({
        where: {
          email,
        },
      });

      if (!admin) {
        throw new HttpException('Credenciales incorrectas!', HttpStatus.UNAUTHORIZED);
      }
      const isPasswordMatching = await bcrypt.compare(password, admin.password);
      if (!isPasswordMatching) {
        throw new HttpException('Credenciales incorrectas!', HttpStatus.BAD_REQUEST);
      }
      return admin;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      } else {
        throw new HttpException('Error al iniciar sesión', HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async update(id: string, admin: Partial<AdminEntity>): Promise<AdminEntity> {
    await this.adminRepository.update(id, admin);
    return this.adminRepository.findOne({
      where: { id },
    });
  }

  async remove(id: string): Promise<void> {
    await this.adminRepository.softDelete(id);
  }
}
