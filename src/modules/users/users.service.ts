import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './entities/users.entity';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>
  ) {}

  async findById(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    return user;
  }

  async login(loginDto: LoginDto): Promise<UserEntity> {
    const { email, password } = loginDto;
    const userExisting = await this.userRepository
      .createQueryBuilder('users')
      .addSelect('users.password')
      .where('users.email = :email', { email })
      .getOne();

    if (!userExisting) {
      throw new BadRequestException('User does not exist');
    }

    if (!userExisting || !userExisting.isVerified) {
      throw new HttpException('Credenciales inválidas', HttpStatus.BAD_REQUEST);
    }

    const matchPassword = await bcrypt.compare(password, userExisting.password);

    if (!matchPassword) {
      throw new HttpException('Credenciales inválidas', HttpStatus.BAD_REQUEST);
    }

    return userExisting;
  }

  async findOneByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({
      where: { email },
    });
  }

  async findAll(): Promise<UserEntity[]> {
    return await this.userRepository.find();
  }

  async findOneById(id: string): Promise<UserEntity | undefined> {
    const user = await this.userRepository.findOne({
      where: {
        id: id,
      },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    return user;
  }

  update(id: string, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  async remove(id: string) {
    const user = await this.userRepository.findOne({
      where: {
        id: id,
        deleted: false,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found or already deleted');
    }

    user.deleted = true;
    await this.userRepository.save(user);

    return `User #${id} has been successfully removed`;
  }
}
