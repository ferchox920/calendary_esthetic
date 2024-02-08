import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsultationEntity } from './entities/consultation.entity';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { ProfessionalEntity } from '../professional/entities/professional.entity';
import { ActivityEntity } from '../activity/entities/activity.entity';
import { UserEntity } from '../users/entities/users.entity';

@Injectable()
export class ConsultationService {
  constructor(
    @InjectRepository(ConsultationEntity)
    private readonly consultationRepository: Repository<ConsultationEntity>,
    @InjectRepository(ProfessionalEntity)
    private readonly professionalRepository: Repository<ProfessionalEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    @InjectRepository(UserEntity) // Agrega el repositorio del usuario
    private readonly userRepository: Repository<UserEntity>
  ) {}

  async create(createConsultationDto: CreateConsultationDto): Promise<ConsultationEntity> {
    const { professionalId, activityId, userId, ...restDto } = createConsultationDto;

    const professional = await this.professionalRepository.findOne({
      where: {
        id: professionalId,
      },
    });
    if (!professional) {
      throw new NotFoundException(`Professional with ID ${professionalId} not found`);
    }
    const activity = await this.activityRepository.findOne({
      where: {
        id: activityId,
      },
    });
    if (!activity) {
      throw new NotFoundException(`Activity with ID ${activityId} not found`);
    }

    const user = await this.userRepository.findOne({
      where: {
        id: userId,
      },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const consultation = this.consultationRepository.create({
      ...restDto,
      professional,
      activity,
      user,
    });

    return await this.consultationRepository.save(consultation);
  }

  async findAll(): Promise<ConsultationEntity[]> {
    return await this.consultationRepository.find();
  }

  async findOne(id: string): Promise<ConsultationEntity> {
    const consultation = await this.consultationRepository.findOne({ where: { id } });
    if (!consultation) {
      throw new NotFoundException(`Consultation with ID ${id} not found`);
    }
    return consultation;
  }

  async update(id: string, updateConsultationDto: UpdateConsultationDto): Promise<ConsultationEntity> {
    await this.findOne(id); // Check if the consultation exists
    await this.consultationRepository.update(id, updateConsultationDto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const consultation = await this.findOne(id);
    await this.consultationRepository.remove(consultation);
  }
}
