import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL
  || process.env.DATABASE_URL_UNPOOLED
  || process.env.POSTGRES_URL_NON_POOLING
  || process.env.POSTGRES_PRISMA_URL
  || process.env.POSTGRES_URL;

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: isProduction ? 20000 : 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

export default pool;
