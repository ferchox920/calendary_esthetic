// create-consultation.dto.ts
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateConsultationDto {
  @ApiProperty({ description: 'Status of the consultation', example: 'Scheduled' })
  @IsNotEmpty({ message: 'Status is required' })
  @IsString({ message: 'Status must be a string' })
  status: string;

  @ApiProperty({ description: 'Date of the consultation', example: '2024-02-10T08:00:00Z' })
  @IsNotEmpty({ message: 'Date is required' })
  @IsString({ message: 'Date must be a string' })
  date: string;

  @ApiProperty({ description: 'Link for payment', example: 'https://payment.link' })
  @IsString({ message: 'Linkpay must be a string' })
  linkpay: string;

  @ApiProperty({ description: 'ID of the professional associated with the consultation' })
  @IsNotEmpty({ message: 'Professional ID is required' })
  @IsUUID('4', { message: 'Invalid professional ID' })
  professionalId: string;

  @ApiProperty({ description: 'ID of the activity associated with the consultation' })
  @IsNotEmpty({ message: 'Activity ID is required' })
  @IsUUID('4', { message: 'Invalid activity ID' })
  activityId: string;
}
