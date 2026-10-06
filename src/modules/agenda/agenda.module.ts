import { Module } from '@nestjs/common';
import { AgendaStore } from './agenda-store.service';
import { ClientsProjectsService } from './clients-projects.service';
import { ClientsController, ProjectsController } from './clients-projects.controller';
import { SchedulingService } from './scheduling.service';
import { AgendaController, BlocksController, SessionsController } from './scheduling.controller';
import { AuditController } from './audit.controller';

@Module({
  controllers: [
    ClientsController,
    ProjectsController,
    AgendaController,
    SessionsController,
    BlocksController,
    AuditController,
  ],
  providers: [AgendaStore, ClientsProjectsService, SchedulingService],
})
export class AgendaModule {}
