import { config } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
config();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  schema: process.env.POSTGRES_SHEMA,
  port: parseInt(process.env.POSTGRES_PORT, 10),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE,
  entities: ['dist/**/*.entity{.ts,.js}'],
  migrations: ['dist/db/migrations/*{.ts,js}'],
  synchronize: false,
  logging: false,
  // extra: {
  //   ssl: {
  //     rejectUnauthorized: false, // Solo si es necesario, dependiendo de la configuración del servidor PostgreSQL.
  //     sslmode: 'require',
  //   },
  // },
};

const dataSource = new DataSource(dataSourceOptions);

dataSource
  .initialize()
  .then(() => {
    console.log('Data Source has been initialized!');
  })
  .catch((err) => {
    console.error('Error during Data Source initialization', err);
  });

export default dataSource;
