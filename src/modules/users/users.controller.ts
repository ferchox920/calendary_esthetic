import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/users.entity';
import { Roles } from 'src/utility/common/roles-enum';
import { AuthorizeGuard } from 'src/modules/auth/guards/authorization.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Users') // Define Swagger tags for this controller
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({
    summary: 'Listar usuarios',
    description:
      'Devuelve la lista de los usuarios. Requiere permisos de administrador.',
  })
  @ApiBearerAuth() // Secure the endpoint with JWT authorization
  @ApiResponse({
    status: 200,
    description: 'Listado de los usuarios.',
    type: UserEntity,
    isArray: true,
  })
  @UseGuards(JwtAuthGuard, AuthorizeGuard([Roles.ADMIN]))
  @Get('/all')
  async findAll(): Promise<UserEntity[]> {
    return await this.usersService.findAll();
  }

  @ApiOperation({
    summary: 'Consultar usuario por ID',
    description:
      'Devuelve los datos del usuario cuyo identificador se indica en la ruta.',
  })
  @ApiResponse({
    status: 200,
    description: 'Datos del registro solicitado.',
    type: UserEntity,
  })
  @Get('single/:id')
  async findOne(@Param('id') id: string) {
    return await this.usersService.findOneById(id);
  }

  @ApiOperation({
    summary: 'Actualizar usuario',
    description:
      'Actualiza los datos del usuario mediante su identificador y los valores enviados en el cuerpo de la solicitud.',
  })
  @ApiResponse({
    status: 200,
    description: 'Registro actualizado correctamente.',
    type: UserEntity,
  })
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return await this.usersService.update(id, updateUserDto);
  }

  @ApiOperation({
    summary: 'Eliminar usuario',
    description:
      'Elimina el registro del usuario mediante el identificador indicado en la ruta.',
  })
  @ApiResponse({
    status: 200,
    description: 'Registro eliminado correctamente.',
  })
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.usersService.remove(id);
  }
}
