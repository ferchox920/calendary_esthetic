import { Roles } from '../../../utility/common/roles-enum';
import { TokenTypes } from '../../../utility/common/token-types.enum';

export interface JwtPayload {
  userType: Roles;
  type: TokenTypes;
  email: string;
  id: string;
  roles: Roles;
  sessionVersion: number;
}
