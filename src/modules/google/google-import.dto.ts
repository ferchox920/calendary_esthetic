import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { VersionDto } from '../agenda/agenda.dto';

export class SelectGoogleCalendarDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(1000) calendarId: string;
}

export class LinkGoogleEventDto extends VersionDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() projectId?: string | null;
}
