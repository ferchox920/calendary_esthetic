import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, Repository } from 'typeorm';
import { UserSignUp } from './dto/user-signup.dto';
import { UserSignIn } from './dto/user-signin.dto';
import { sign } from 'jsonwebtoken';
import { UserEntity } from './entities/users.entity';
import { EmailService } from '../email/email.service';
import { ConfirmEmailData } from '../email/interface';
import { TemplateEnum } from '../email/enum/template.enum';
import { EmailAdminitrationEnum } from 'src/utility/commons/email-adminitration-enum';
import { JwtPayload } from 'src/utility/interface/jwt-payload.interface';
import { TokenTypes } from 'src/utility/commons/token-types.enum';
import { Roles } from 'src/utility/commons/roles-enum';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private readonly emailService: EmailService,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
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
        throw new HttpException(
          'The user is already registered.',
          HttpStatus.BAD_REQUEST,
        );
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
        EmailAdminitrationEnum.NOTIFICATION,
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

  async register(userSignIn: UserSignIn):Promise<{ user: Partial<UserEntity>; credential: Record<string, string> }> {
    const { email, password } = userSignIn;

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
      ...userSignIn,
      password: hashPassword, // Corregir el nombre del campo de la contraseña
      isRegister: true,
    });

    const payload: JwtPayload = {
      type: TokenTypes.ACCESS,
      email: createdUser.email,
      id: createdUser.id,
      role: Roles.USER,
    };

    const credential = {
      access_token: this.jwtService.sign(payload),
      refresh_token: this.jwtService.sign({
        ...payload,
        type: TokenTypes.REFRESH,
        expireIn: process.env.JWT_EXPIRATION_TIME,
      }),
    };

    const { password: _, ...savedUser } = createdUser;

    return {
      user: savedUser,
      credential,
    };
  }

  async login(userSignIn: UserSignIn): Promise<UserEntity> {
    const { email, password } = userSignIn;

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
    delete userExisting.password;

    return userExisting;
  }

  async findOneByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({
      where: { email },
    });
  }

  async accessToken(user: UserEntity): Promise<string> {
    return sign(
      { id: user.id, email: user.email },
      process.env.ACCESS_TOKEN_SECRET_KEY,
      { expiresIn: process.env.JWT_EXPIRATION_TIME },
    );
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

  update(id: number, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}
