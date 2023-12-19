import { Injectable } from '@nestjs/common';
import * as CryptoJS from 'crypto-js';

@Injectable()
export class CommonService {
  constructor() {}
  async computeSha256Hash(datos: string): Promise<string> {
    const hash = CryptoJS.SHA256(datos);
    const hexhash = hash.toString(CryptoJS.enc.Hex);
    return hexhash;
  }

  async getHashHmacSha256(text: string, key: string): Promise<string> {
    const hash = CryptoJS.HmacSHA256(text, key);
    return CryptoJS.enc.Hex.stringify(hash);
  }
}
