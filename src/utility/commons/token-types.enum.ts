export class TokenTypes {
  public constructor(init?: Partial<TokenTypes>) {
    Object.assign(this, init);
    TokenTypes.ACCESS = 0;
    TokenTypes.CHANGEPASSWORD = 1;
    TokenTypes.REFRESH = 2;
  }

  static ACCESS = 0;
  static CHANGEPASSWORD = 1;
  static REFRESH = 2;
}
