// profession.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfessionEntity } from './entities/profession.entity';
import { CreateProfessionDto } from './dto/create-profession.dto';

@Injectable()
export class ProfessionService {
  constructor(
    @InjectRepository(ProfessionEntity)
    private readonly professionRepository: Repository<ProfessionEntity>
  ) {}

  async createProfession(createProfessionDto: CreateProfessionDto): Promise<ProfessionEntity> {
    const { name, description } = createProfessionDto;
    const newProfession = this.professionRepository.create({ name, description });
    return await this.professionRepository.save(newProfession);
  }

  async getProfessionById(id: string): Promise<ProfessionEntity> {
    const profession = await this.professionRepository.findOne({
      where: {
        id,
      },
    });

    if (!profession) {
      throw new NotFoundException('Profession not found');
    }

    return profession;
  }

  async getAllProfessions(): Promise<ProfessionEntity[]> {
    return await this.professionRepository.find();
  }

  async updateProfession(id: string, updateProfessionDto: CreateProfessionDto): Promise<ProfessionEntity> {
    const profession = await this.getProfessionById(id);

    const { name, description } = updateProfessionDto;
    profession.name = name;
    profession.description = description;

    return await this.professionRepository.save(profession);
  }

  async deleteProfession(professionId: string): Promise<void> {
    const profession = await this.getProfessionById(professionId);
    await this.professionRepository.remove(profession);
  }
}
