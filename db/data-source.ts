import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { createDatabaseOptions } from './database-options';
config({ quiet: true });

export const dataSourceOptions = createDatabaseOptions(process.env);

const dataSource = new DataSource(dataSourceOptions);

// Nest owns the application connection; the CLI initializes its own instance.
export default dataSource;
