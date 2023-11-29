import { Module, Global, DynamicModule } from '@nestjs/common';
import { EmailService } from './email.service';

export interface EmailModuleOptions {
  tokenGmail: string;
  emailNodemail: string;
  key: string; //id
}

@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {
  static forRoot(options: EmailModuleOptions[]): DynamicModule {
    return {
      module: EmailModule,
      providers: [{ provide: 'EMAIL_MODULE_OPTIONS', useValue: options }],
    };
  }
}
