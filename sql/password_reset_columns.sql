ALTER TABLE usuarios
  ADD COLUMN reset_password_token VARCHAR(64) NULL,
  ADD COLUMN reset_password_expires DATETIME NULL,
  ADD INDEX idx_usuarios_reset_password_token (reset_password_token);
