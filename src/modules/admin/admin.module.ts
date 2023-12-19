import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminEntity } from './entities/admin.entity';




@Module({
  imports: [TypeOrmModule.forFeature([AdminEntity])],
  providers: [AdminService],
  controllers: [AdminController],
  exports:[AdminService]
})
export class AdminModule {}

