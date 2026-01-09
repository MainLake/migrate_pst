# Add example init script for source database
CREATE SCHEMA IF NOT EXISTS demo_schema;

CREATE TABLE IF NOT EXISTS demo_schema.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demo_schema.logs (
    id SERIAL PRIMARY KEY,
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO demo_schema.users (username, email) VALUES
    ('alice', 'alice@example.com'),
    ('bob', 'bob@example.com'),
    ('charlie', 'charlie@example.com');

INSERT INTO demo_schema.logs (message) VALUES
    ('System started'),
    ('User alice logged in'),
    ('User bob logged in');
