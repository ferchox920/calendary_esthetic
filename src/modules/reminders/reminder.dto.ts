import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { VersionDto } from '../agenda/agenda.dto';

export class ReminderRuleDto {
  @ApiProperty({ type: Number, example: 1440 }) @IsInt() @Min(1) @Max(10080) leadMinutes: number;
  @ApiProperty({ type: String }) @IsString() @MinLength(1) @MaxLength(1000) template: string;
}
export class ReminderSettingsDto extends VersionDto {
  @ApiProperty({ type: Boolean }) @IsBoolean() enabled: boolean;
  @ApiProperty({ type: [ReminderRuleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ReminderRuleDto)
  rules: ReminderRuleDto[];
  @ApiProperty({ type: String, example: '09:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  allowedStart: string;
  @ApiProperty({ type: String, example: '20:00' }) @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) allowedEnd: string;
  @ApiProperty({ type: Number, example: 30 }) @IsInt() @Min(0) @Max(240) graceMinutes: number;
  @ApiProperty({ type: Number, example: 3 }) @IsInt() @Min(1) @Max(5) maxAttempts: number;
}
export class ClientReminderDto {
  @ApiProperty({ type: Number, description: '0 si todavía no hay preferencias' }) @IsInt() @Min(0) version: number;
  @ApiProperty({ type: Boolean }) @IsBoolean() enabled: boolean;
  @ApiPropertyOptional({ type: String, description: 'Destino internacional explícito; no se deduce país' })
  @ValidateIf((o) => o.phoneE164 !== undefined)
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164?: string;
  @ApiPropertyOptional({ type: Boolean, description: 'true registra una nueva aceptación' })
  @ValidateIf((o) => o.consentAccepted !== undefined)
  @IsBoolean()
  consentAccepted?: boolean;
  @ApiPropertyOptional({ type: String })
  @ValidateIf((o) => o.consentSource !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  consentSource?: string;
}
export class SessionReminderDto extends VersionDto {
  @ApiProperty({ type: Boolean }) @IsBoolean() disabled: boolean;
}
export class ReminderHistoryDto {
  @ApiPropertyOptional({ type: Number }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @ApiPropertyOptional({ type: Number }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsUUID() entryId?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsIn(['pending', 'processing', 'sent', 'failed', 'canceled', 'uncertain'])
  state?: string;
}
