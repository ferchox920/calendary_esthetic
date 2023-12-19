import { Roles } from "src/utility/common/roles-enum";
import { TokenTypes } from "src/utility/common/token-types.enum";



export interface JwtPayload {
  userType: Roles;
  type: TokenTypes;
  email: string;
  id: string;
  roles: Roles;
}
