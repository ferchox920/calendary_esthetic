import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { LoginProfessionalDto } from './dto/login-professional.dto';
import { CreateProfessionalDto } from './dto/create-professional.dto';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import { ProfessionalEntity } from './entities/professional.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Roles } from 'src/utility/common/roles-enum';
import { ProfessionEntity } from '../profession/entities/profession.entity';

@Injectable()
export class ProfessionalService {
  constructor(
    @InjectRepository(ProfessionalEntity)
    private professionalRepository: Repository<ProfessionalEntity>,
    @InjectRepository(ProfessionEntity)
    private readonly professionRepository: Repository<ProfessionEntity>
  ) {}

  async create(createProfessionalDto: CreateProfessionalDto): Promise<ProfessionalEntity> {
    const existingProfessional = await this.professionalRepository.findOne({
      where: { email: createProfessionalDto.email },
    });
    if (existingProfessional) {
      throw new HttpException('The professional is already registered.', HttpStatus.BAD_REQUEST);
    }
    const hashedPassword = await bcrypt.hash(createProfessionalDto.password, 10);
    const newAdmin = this.professionalRepository.create({
      ...createProfessionalDto,
      roles: Roles.PROFESSIONAL,
      password: hashedPassword,
    });
    return await this.professionalRepository.save(newAdmin);
  }

  async addProfessionsToProfessional(
    professionalId: string,
    professionIds: string | string[]
  ): Promise<ProfessionalEntity> {
    const professional = await this.professionalRepository.findOne({
      where: { id: professionalId },
      relations: ['professions'],
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }
    const professionIdsArray = Array.isArray(professionIds) ? professionIds : [professionIds];
    const existingProfessions = professional.professions.filter((existingProfession) =>
      professionIdsArray.includes(existingProfession.id)
    );

    const newProfessionIds = professionIdsArray.filter(
      (newProfessionId) => !existingProfessions.some((existingProfession) => existingProfession.id === newProfessionId)
    );

    if (newProfessionIds.length > 0) {
      const newProfessions = await Promise.all(
        newProfessionIds.map((id) => this.professionRepository.findOne({ where: { id } }))
      );

      professional.professions.push(...newProfessions);

      return await this.professionalRepository.save(professional);
    }

    return professional;
  }

  async login(loginProfessionalDto: LoginProfessionalDto) {
    const { email, password } = loginProfessionalDto;
    try {
      const profesional = await this.professionalRepository.findOne({
        where: {
          email,
        },
      });

      if (!profesional) {
        throw new HttpException('Credenciales incorrectas!', HttpStatus.UNAUTHORIZED);
      }
      const isPasswordMatching = await bcrypt.compare(password, profesional.password);
      if (!isPasswordMatching) {
        throw new HttpException('Credenciales incorrectas!', HttpStatus.BAD_REQUEST);
      }
      return profesional;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      } else {
        throw new HttpException('Error al iniciar sesión', HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }
  async findAll() {
    return await this.professionalRepository.find({ relations: ['professions'] });
  }

  async findOneAuth(id: string): Promise<ProfessionalEntity> {
    return this.professionalRepository.findOne({
      where: { id },
    });
  }

  async findOne(id: string): Promise<ProfessionalEntity | undefined> {
    return await this.professionalRepository.findOne({
      where: {
        id: id,
      },
      relations: ['professions'],
    });
  }

  async update(id: string, updateProfessionalDto: UpdateProfessionalDto): Promise<ProfessionalEntity> {
    const professional = await this.professionalRepository.findOne({
      where: {
        id: id,
      },
    });

    if (!professional) {
      throw new NotFoundException(`Professional with ID ${id} not found`);
    }
    Object.assign(professional, updateProfessionalDto);

    return this.professionalRepository.save(professional);
  }

  async remove(id: string): Promise<void> {
    const professional = await this.professionalRepository.findOne({
      where: {
        id: id,
      },
    });

    if (!professional) {
      throw new NotFoundException(`Professional with ID ${id} not found`);
    }

    // Eliminar el profesional de la base de datos
    await this.professionalRepository.remove(professional);
  }
}
