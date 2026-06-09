-- Create the database if it does not exist
CREATE DATABASE IF NOT EXISTS yintong_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE yintong_db;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    hashed_password VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL,
    real_name VARCHAR(255) NULL,
    phone_number VARCHAR(255) NULL,
    phone_number_blind_index VARCHAR(64) NULL,
    device_mapping_credential VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_username (username),
    INDEX idx_users_phone_blind (phone_number_blind_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Nostalgia Pins Table
CREATE TABLE IF NOT EXISTS nostalgia_pins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    year VARCHAR(20) NOT NULL,
    image_url VARCHAR(255) NULL,
    latitude DOUBLE NOT NULL,
    longitude DOUBLE NOT NULL,
    likes INT DEFAULT 0,
    creator_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_pins_coords (latitude, longitude)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Voice Messages Table
CREATE TABLE IF NOT EXISTS voice_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NULL,
    text TEXT NOT NULL,
    audio_url VARCHAR(255) NULL,
    duration_seconds INT DEFAULT 0,
    is_unread BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) DEFAULT 'PENDING',
    replied_text TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_messages_sender (sender_id),
    INDEX idx_messages_receiver (receiver_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Moderation Logs Table
CREATE TABLE IF NOT EXISTS moderation_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    reason VARCHAR(255) NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_moderation_time (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
