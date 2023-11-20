// import { Injectable, NestMiddleware } from '@nestjs/common';
// import { Request, Response, NextFunction } from 'express';
// import { verify } from 'jsonwebtoken';
// import { UsersService } from 'src/users/users.service';
// import { JwtPayload } from './interface';
// import { UserEntity } from 'src/users/entities/user.entity';

// declare global {
//   namespace Express {
//     interface Request {
//       currentUser?: UserEntity;
//     }
//   }
// }

// @Injectable()
// export class CurrentUserMiddleware implements NestMiddleware {
//   constructor(private readonly usersService: UsersService) {}
//   async use(req: Request, res: Response, next: NextFunction) {
//     const authHeader = req.headers.authorization;

//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//       req.currentUser = null;
//       next();
//       return;
//     } else {
//       try {
//         const token = authHeader.split(' ')[1];
//         const { id } = <JwtPayload>(
//           verify(token, process.env.ACCESS_TOKEN_SECRET_KEY)
//         );
//         const currentUser = await this.usersService.findOneById(id);
//         req.currentUser = currentUser;
//         next();
//       } catch (error) {
//         res.status(401).json({ message: 'Token inválido' });
//       }
//     }
//   }
// }
