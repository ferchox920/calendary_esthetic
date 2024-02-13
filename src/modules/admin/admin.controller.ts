import { Controller, Get, Post, Param, Body, Put, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminEntity } from './entities/admin.entity';
import { CreateAdminDto } from './dto/create-admin.dto';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @ApiOperation({ summary: 'Get all admins' })
  @ApiResponse({ status: 200, description: 'Return all admins', type: AdminEntity, isArray: true })
  @Get()
  async findAll(): Promise<AdminEntity[]> {
    return await this.adminService.findAll();
  }

  @ApiOperation({ summary: 'Get admin by ID' })
  @ApiParam({ name: 'id', description: 'Admin ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Return admin by ID', type: AdminEntity })
  @Get(':id')
  findOne(@Param('id') id: string): Promise<AdminEntity> {
    return this.adminService.findOne(id);
  }

  @ApiOperation({ summary: 'Create a new admin' })
  @ApiBody({ type: CreateAdminDto })
  @ApiResponse({ status: 201, description: 'Admin created successfully', type: AdminEntity })
  @Post()
  create(@Body() createAdminDto: CreateAdminDto): Promise<AdminEntity> {
    return this.adminService.create(createAdminDto);
  }

  @ApiOperation({ summary: 'Update admin by ID' })
  @ApiParam({ name: 'id', description: 'Admin ID', type: 'string' })
  @ApiBody({ type: AdminEntity })
  @ApiResponse({ status: 200, description: 'Admin updated successfully', type: AdminEntity })
  @Put(':id')
  update(@Param('id') id: string, @Body() admin: Partial<AdminEntity>): Promise<AdminEntity> {
    return this.adminService.update(id, admin);
  }

  @ApiOperation({ summary: 'Delete admin by ID' })
  @ApiParam({ name: 'id', description: 'Admin ID', type: 'string' })
  @ApiResponse({ status: 204, description: 'Admin deleted successfully' })
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.adminService.remove(id);
  }
}
