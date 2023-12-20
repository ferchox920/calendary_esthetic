import { Controller, Get, Post, Param, Body, Put, Delete } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminEntity } from './entities/admin.entity';
import { CreateAdminDto } from './dto/create-admin.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  async findAll(): Promise<AdminEntity[]> {
    return await this.adminService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<AdminEntity> {
    return this.adminService.findOne(id);
  }

  @Post()
  create(@Body() createAdminDto: CreateAdminDto): Promise<AdminEntity> {
    return this.adminService.create(createAdminDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() admin: Partial<AdminEntity>): Promise<AdminEntity> {
    return this.adminService.update(id, admin);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.adminService.remove(id);
  }
}
