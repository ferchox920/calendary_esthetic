import { TemplateEnum } from '../enum/template.enum';

export interface SendEmailConfig<T> {
  to: string;
  subject: string;
  template: TemplateEnum;
  data?: T;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface ConfirmEmailData {
  otpCode: string;
  year: string;
}

export interface CreateAdmin {
  companyName: string;
  link: string;
  year: string;
}
export interface SuccessfulCreateAdmin {
  companyId: string;
  companyName: string;
  name: string;
  year: string;
}

export interface ForgotPassword {
  link: string;
  year: string;
}
export interface InvitationWorker {
  companyName: string;
  link: string;
  year: string;
}
export interface SuccessfulChangePassword {
  name: string;
  year: string;
}

export interface CreateOrder {
  userName: string;
  amount: string;
  /// el resto de data
}

export interface remplacementNotification {
  name: string;
  link: string;
  count: string;
  days: number;
  year: number;
  /// el resto de data
}
export interface transactionsNotifications {
  name: string;
  link: string;
  count: string;
  sum: string;
  days: number;
  year: number;
  /// el resto de data
}
