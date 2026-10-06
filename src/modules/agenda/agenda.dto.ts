import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
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
  ValidateNested,
} from 'class-validator';

export class VersionDto {
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  version: number;
}

export class CreateClientDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  shortNote?: string;
}

export class UpdateClientDto extends VersionDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string | null;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  shortNote?: string | null;
}

export class CreateProjectDto {
  @ApiProperty({ type: String })
  @IsUUID()
  clientId: string;
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  briefDescription?: string;
}

export class UpdateProjectDto extends VersionDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  briefDescription?: string | null;
}

export class PageDto {
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsIn(['true', 'false'])
  archived = 'false';
}

export class WindowDto {
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;
  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  localStart: string;
  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  localEnd: string;
  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validFrom: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validTo?: string;
}

export class SettingsDto extends VersionDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  defaultPrepMinutes?: number;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  defaultCleanupMinutes?: number;
}

export class WindowsDto extends VersionDto {
  @ApiProperty({ type: [WindowDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WindowDto)
  windows: WindowDto[];
}

export class IntervalDto {
  @ApiProperty({ type: String })
  @IsString()
  @MaxLength(40)
  startAt: string;
  @ApiProperty({ type: String })
  @IsString()
  @MaxLength(40)
  endAt: string;
}

export class CreateSessionDto extends IntervalDto {
  @ApiProperty({ type: String })
  @IsUUID()
  projectId: string;
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description: string;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  prepMinutes?: number;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  cleanupMinutes?: number;
}

export class RescheduleDto extends IntervalDto {
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  version: number;
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason: string;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  prepMinutes?: number;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  cleanupMinutes?: number;
}

export class ReasonDto extends VersionDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason: string;
}

export class CorrectStatusDto extends ReasonDto {
  @ApiProperty({ type: String })
  @IsIn(['pending', 'confirmed', 'done', 'absent', 'canceled'])
  status: string;
}

export class CreateBlockDto extends IntervalDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason: string;
}

export class ChangeBlockDto extends CreateBlockDto {
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  version: number;
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  active: boolean;
}

export class RangeDto {
  @ApiProperty({ type: String })
  @IsString()
  @MaxLength(40)
  from: string;
  @ApiProperty({ type: String })
  @IsString()
  @MaxLength(40)
  to: string;
}

export class DayDto {
  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;
}

export class AuditQueryDto extends PageDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsIn(['client', 'project', 'session', 'block', 'agenda', 'google', 'reminder'])
  entityType?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;
}
