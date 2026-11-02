import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleAuthController, GoogleController } from './google.controller';
import { GoogleGateway } from './google.gateway';
import { GoogleService } from './google.service';
import { GoogleSyncService } from './google-sync.service';
import { AgendaModule } from '../agenda/agenda.module';
import { GoogleImportService } from './google-import.service';
import { GoogleImportController } from './google-import.controller';

@Module({
  imports: [AuthModule, AgendaModule],
  controllers: [GoogleAuthController, GoogleController, GoogleImportController],
  providers: [GoogleGateway, GoogleService, GoogleSyncService, GoogleImportService],
})
export class GoogleModule {}
