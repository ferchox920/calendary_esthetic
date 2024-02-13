import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsultationEntity } from './entities/consultation.entity';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { ProfessionalEntity } from '../professional/entities/professional.entity';
import { ActivityEntity } from '../activity/entities/activity.entity';
import { UserEntity } from '../users/entities/users.entity';
import { ConsultStatusEnum } from 'src/utility/common/consult-status.enum';

@Injectable()
export class ConsultationService {
  constructor(
    @InjectRepository(ConsultationEntity)
    private readonly consultationRepository: Repository<ConsultationEntity>,
    @InjectRepository(ProfessionalEntity)
    private readonly professionalRepository: Repository<ProfessionalEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>
  ) {}

  async create(createConsultationDto: CreateConsultationDto): Promise<ConsultationEntity> {
    const { professionalId, activityId, userId, date, ...restDto } = createConsultationDto;

    const professional = await this.professionalRepository.findOne({
      where: {
        id: professionalId,
      },
      relations: ['consultations'],
    });

    if (!professional) {
      throw new NotFoundException(`Professional with ID ${professionalId} not found`);
    }

    const user = await this.userRepository.findOne({
      where: {
        id: userId,
      },
      relations: ['consultations'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Verificar si hay solapamiento de horarios para el profesional
    const isProfessionalScheduleOccupied = professional.consultations.some((consultation) => {
      return consultation.date === date && consultation.status !== ConsultStatusEnum.CANCELED;
    });

    if (isProfessionalScheduleOccupied) {
      throw new BadRequestException('Professional schedule is already occupied at the specified time');
    }

    // Verificar si hay solapamiento de horarios para el usuario
    const isUserScheduleOccupied = user.consultations.some((consultation) => {
      return consultation.date === date && consultation.status !== ConsultStatusEnum.CANCELED;
    });

    if (isUserScheduleOccupied) {
      throw new BadRequestException('User schedule is already occupied at the specified time');
    }

    // Resto de tu código para crear la consulta
    // ...

    const consultation = this.consultationRepository.create({
      ...restDto,
      date,
      professional,
      activity: activityId ? { id: activityId } : null,
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
