import { Roles } from "src/utility/common/roles-enum";

export class CreateUserDto {
    id: number;
    name: string;
    email: string;
    password: string;

}
