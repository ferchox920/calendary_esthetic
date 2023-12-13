import { Controller, Get, Post, Param, Body, Put, Delete } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminEntity } from './entities/admin.entity';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  findAll(): Promise<AdminEntity[]> {
    return this.adminService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<AdminEntity> {
    return this.adminService.findOne(id);
  }

  @Post()
  create(@Body() admin: AdminEntity, key: string): Promise<AdminEntity> {
    return this.adminService.create(admin, key);
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
