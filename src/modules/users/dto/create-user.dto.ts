import { Roles } from "src/utility/commons/roles-enum";

export class CreateUserDto {
    id: number;
    name: string;
    email: string;
    password: string;
    roles: Roles[];
}
