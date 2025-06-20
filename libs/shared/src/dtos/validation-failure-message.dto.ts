import { IsNotEmpty, IsString } from 'class-validator';
import { ValidationErrorType } from '../enums';

export class ValidationErrorDto {
  @IsString()
  @IsNotEmpty()
  type: ValidationErrorType;

  @IsString()
  @IsNotEmpty()
  message: string;
}
