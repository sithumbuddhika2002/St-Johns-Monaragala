-- ============================================
-- Class Attend - Database Setup
-- ============================================

CREATE DATABASE IF NOT EXISTS class_attend
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE class_attend;

-- ---- Users ----
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student','admin') NOT NULL DEFAULT 'student',
  lang_pref ENUM('en','si') NOT NULL DEFAULT 'en',
  theme_pref ENUM('light','dark') NOT NULL DEFAULT 'light',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---- Availability ----
CREATE TABLE IF NOT EXISTS availability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  year SMALLINT NOT NULL,
  week_number TINYINT NOT NULL,
  day_of_week TINYINT NOT NULL COMMENT '0=Mon,1=Tue,2=Wed,3=Thu,4=Fri,5=Sat,6=Sun',
  is_free TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_week_day (user_id, year, week_number, day_of_week)
) ENGINE=InnoDB;

-- ---- Default admin account ----
-- Password: admin123
INSERT INTO users (name, email, password_hash, role)
VALUES ('Admin', 'admin@class.lk', '$2y$10$gt7DEkMfGAVjWwuN4qkrQO.jAXsm1HLeA8eIH7yzmUx8Crpv6gaeK', 'admin')
ON DUPLICATE KEY UPDATE name=name;
