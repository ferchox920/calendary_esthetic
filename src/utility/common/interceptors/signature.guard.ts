import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { CommonService } from '../services/common.service';

@Injectable()
export class SignatureGuard implements CanActivate {
  constructor(private commonService: CommonService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const headers = await this.getSignatureHeaders(request);

    if (!headers) {
      throw new UnauthorizedException('It was not possible to recover the headers of the signature.');
    }

    if (!(await this.validateSignature(request, headers))) {
      throw new UnauthorizedException('The signature supplied is invalid.');
    }
    return true;
  }

  async getSignatureHeaders(request: any): Promise<any> {
    if (
      !request.headers['signature_interceptor'] ||
      (request.headers['signature_interceptor'] as string).length === 0
    ) {
      return null;
    }

    if (
      !request.headers['timestamp_interceptor'] ||
      (request.headers['timestamp_interceptor'] as string).length === 0
    ) {
      return null;
    }

    return {
      timeStamp: request.headers['timestamp_interceptor'],
      signature: request.headers['signature_interceptor'],
    };
  }

  async validateSignature(request: any, headers: any): Promise<boolean> {
    let jsonContent = '';

    if (request.body !== undefined && request.body != null && Object.keys(request.body).length > 0) {
      jsonContent = JSON.stringify(request.body);
    }

    const timeStampQuery = parseInt(headers.timeStamp);
    const url = process.env.API_URL;

    const compareString = timeStampQuery + url + (await this.commonService.computeSha256Hash(jsonContent));
    const cadenaCodificada = await this.commonService.getHashHmacSha256(
      compareString,
      process.env.ENCRIPTION_PUBLIC_KEY
    );

    console.log('cadenaCodificada');
    console.log(cadenaCodificada);

    if (headers.signature !== cadenaCodificada) {
      return false;
    }

    return true;
  }
}
