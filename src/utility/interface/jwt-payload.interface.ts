
import { Roles } from '../commons/roles-enum';
import { TokenTypes } from '../commons/token-types.enum';


export interface JwtPayload {
  type: TokenTypes;
  email: string;
  id: string;
  role: Roles;
  company?: string
}
