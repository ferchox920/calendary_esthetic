import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleAuthController, GoogleController } from './google.controller';
import { GoogleGateway } from './google.gateway';
import { GoogleService } from './google.service';
import { GoogleSyncService } from './google-sync.service';

@Module({
  imports: [AuthModule],
  controllers: [GoogleAuthController, GoogleController],
  providers: [GoogleGateway, GoogleService, GoogleSyncService],
})
export class GoogleModule {}
