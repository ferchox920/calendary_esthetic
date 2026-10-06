import { EmailService } from './email.service';
import { TemplateEnum } from './enum/template.enum';
import nodemailer from 'nodemailer';

describe('Email delivery mode', () => {
  const originalMode = process.env.EMAIL_MODE;
  afterEach(() => {
    if (originalMode === undefined) delete process.env.EMAIL_MODE;
    else process.env.EMAIL_MODE = originalMode;
    jest.restoreAllMocks();
  });

  it('skips delivery without constructing an SMTP transport', async () => {
    process.env.EMAIL_MODE = 'disabled';
    const transport = jest.spyOn(nodemailer, 'createTransport');
    const service = new EmailService([]);
    await expect(service.sendEmail({
      to: 'demo@example.test', subject: 'Demo', template: TemplateEnum.CONFIRM_EMAIL,
      data: {},
    }, 'demo')).resolves.toEqual({ skipped: true });
    expect(transport).not.toHaveBeenCalled();
  });
});
