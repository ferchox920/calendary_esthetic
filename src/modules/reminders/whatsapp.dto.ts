import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, ValidateIf } from 'class-validator';

export class WhatsAppLinkDto {
  @ApiProperty({ enum: ['code', 'qr'] })
  @IsIn(['code', 'qr'])
  mode: 'code' | 'qr';

  @ApiProperty({
    required: false,
    description: 'Número internacional de la cuenta a vincular. Obligatorio sólo para mode=code.',
  })
  @ValidateIf((value) => value.mode === 'code' || value.phoneE164 !== undefined)
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164?: string;
}

export class WhatsAppEmptyDto {}
