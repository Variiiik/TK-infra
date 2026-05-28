-- TakeControl PostgreSQL initialization
-- This file runs when the container is first created

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Ensure the database is created with proper settings
ALTER DATABASE takecontrol_db SET timezone TO 'UTC';
ALTER DATABASE takecontrol_db SET log_min_duration_statement TO 1000;

-- Create indexes that Prisma won't create automatically
-- (These are managed by Prisma migrations, kept here as reference)
