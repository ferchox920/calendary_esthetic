import { Roles } from "src/utility/commons/roles-enum";
import { TokenTypes } from "src/utility/commons/token-types.enum";



export interface JwtPayload {
  userType: Roles;
  type: TokenTypes;
  email: string;
  id: string;
  roles: Roles;
}
