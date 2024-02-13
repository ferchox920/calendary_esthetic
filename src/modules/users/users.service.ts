import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserEntity } from './entities/users.entity';
import { EmailService } from '../email/email.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { EmailAdminitrationEnum } from 'src/utility/common/email-adminitration-enum';
import { TemplateEnum } from '../email/enum/template.enum';
import { ConfirmEmailData } from '../email/interface';
import { JwtService } from '@nestjs/jwt';
import { Roles } from 'src/utility/common/roles-enum';
import { TokenTypes } from 'src/utility/common/token-types.enum';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource
  ) {}

  async generateOTP(email: string): Promise<string> {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      const user = await this.userRepository.findOne({
        where: { email },
      });

      if (user?.isRegister) {
        throw new HttpException('The user is already registered.', HttpStatus.BAD_REQUEST);
      }
      const otpExpiryTime = new Date();
      otpExpiryTime.setMinutes(otpExpiryTime.getMinutes() + 10);

      const newUser = this.userRepository.create({
        email,
        otp: otp.toString(),
        otpExpiryTime,
        isVerified: false,
        isRegister: false,
        deleted: false,
      });

      const userToSave = user ? Object.assign(user, newUser) : newUser;

      await this.userRepository.save(userToSave);

      await this.emailService.sendEmail<ConfirmEmailData>(
        {
          to: email,
          subject: 'Confirmacion de Email',
          template: TemplateEnum.CONFIRM_EMAIL,
          data: {
            otpCode: otp,
            year: new Date().getFullYear().toString(),
          },
        },
        EmailAdminitrationEnum.NOTIFICATION
      );
      await queryRunner.commitTransaction();
      return otp.toString();
    } catch (ex) {
      await queryRunner.rollbackTransaction();
      throw new HttpException(ex.message, ex.status);
    } finally {
      await queryRunner.release();
    }
  }

  async verifyEmail(otp: string, email: string) {
    try {
      const user = await this.userRepository.findOne({
        where: { email },
      });
      if (!user) {
        throw new HttpException('Usuario inexistente', HttpStatus.BAD_REQUEST);
      }

      if (user.otpExpiryTime < new Date()) {
        throw new HttpException('El codigo ha expirado', HttpStatus.BAD_REQUEST);
      }
      if (user.otp !== otp) {
        throw new HttpException('El codigo ingresado es incorrecto', HttpStatus.BAD_REQUEST);
      }

      user.isVerified = true;
      await this.userRepository.save(user);
      return user;
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async register(registerUserDto: RegisterUserDto): Promise<{
    user: Partial<UserEntity>;
    credential: Record<string, string>;
  }> {
    const { email, password } = registerUserDto;

    const verifiedUserWithEmail = await this.userRepository.findOne({
      where: {
        email: email.toLowerCase().trim(),
        isVerified: true,
      },
    });

    if (!verifiedUserWithEmail) {
      throw new HttpException('Email no verificado', HttpStatus.BAD_REQUEST);
    }

    if (verifiedUserWithEmail.isRegister) {
      throw new HttpException('Email ya registrado.', HttpStatus.BAD_REQUEST);
    }

    if (verifiedUserWithEmail.deleted) {
      throw new HttpException('Usuario eliminado por el administrador', HttpStatus.BAD_REQUEST);
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const createdUser = await this.userRepository.save({
      ...verifiedUserWithEmail,
      ...registerUserDto,
      roles: Roles.USER,
      password: hashPassword,
      isRegister: true,
    });

    const credential = {
      access_token: this.generateAccessToken({
        userType: Roles.USER,
        type: TokenTypes.ACCESS,
        email: createdUser.email,
        id: createdUser.id,
        roles: createdUser.roles,
      }),
      refresh_token: this.generateRefreshToken({
        userType: Roles.USER,
        type: TokenTypes.REFRESH,
        email: createdUser.email,
        id: createdUser.id,
        roles: createdUser.roles,
      }),
    };

    const { password: _, ...savedUser } = createdUser;

    return {
      user: savedUser,
      credential,
    };
  }

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

  generateAccessToken(payload: Record<string, any>): string {
    return this.jwtService.sign(payload, {
      secret: process.env.ACCESS_TOKEN_SECRET_KEY,
      expiresIn: process.env.JWT_EXPIRATION_TIME || '1h',
    });
  }

  generateRefreshToken(payload: Record<string, any>): string {
    return this.jwtService.sign(payload, {
      secret: process.env.ACCESS_TOKEN_SECRET_KEY,
      expiresIn: process.env.JWT_EXPIRATION_TIME_REFRESH || '7d',
    });
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
