import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import SendmailTransport from 'nodemailer/lib/sendmail-transport';
import { EmailModuleOptions } from './email.module';
import { SendEmailConfig } from './interface';
import { TemplateEnum } from './enum/template.enum';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmailService {
  private transporter(data: any): Transporter<SendmailTransport.SentMessageInfo> {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: data.user,
        pass: data.pass,
      },
    });
  }

  private readonly TemplatePath = {
    [TemplateEnum.CONFIRM_EMAIL]: path.join( 'dist/modules/email/templates', 'confirmEmail.hbs'),
   
  };

  private options: EmailModuleOptions[] = [];

  constructor(@Inject('EMAIL_MODULE_OPTIONS') private readonly emailModuleOptions: EmailModuleOptions[]) {
    this.options = this.emailModuleOptions;
  }

  async sendEmail<T>(sendEmailConfig: SendEmailConfig<T>, key: string) {
    try {
      const config = this.options.find((config) => config.key === key);
      if (!config) throw new HttpException(`Key no encontrada: ${key}`, HttpStatus.NOT_FOUND);
      const html = await this.getTemplate(sendEmailConfig.template, sendEmailConfig.data);
      const mailOptions: nodemailer.SendMailOptions = {
        from: config.emailNodemail,
        to: sendEmailConfig.to,
        subject: sendEmailConfig.subject,
        html,
      };
      const transporter = this.transporter({
        user: config.emailNodemail,
        pass: config.tokenGmail,
      });
      const info = await transporter.sendMail(mailOptions);
      console.log('Message sent: %s', info.messageId);
      return info;
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async getTemplate(template: TemplateEnum, data?: any): Promise<string> {
    try {
      const templatePath = this.TemplatePath[template];

      if (!templatePath) {
        throw new HttpException(`Plantilla no encontrada: ${template}`, HttpStatus.NOT_FOUND);
      }

      const templateContent = await fs.promises.readFile(templatePath, 'utf-8');
      const compiledTemplate = Handlebars.compile(templateContent);
      if (data) {
        return compiledTemplate(data);
      }

      return templateContent;
    } catch (error) {
      console.log(error);
      throw new HttpException(`Error al cargar la plantilla: ${template}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // async addOptions(options: EmailModuleOptions): Promise<void> {
  //   const existingKey = this.options.find((config) => config.key === options.key);
  //   if (existingKey) throw new HttpException(`Key ya encontrada: ${options.key}`, HttpStatus.CONFLICT);
  //   this.options.push(options);
  // }
}
