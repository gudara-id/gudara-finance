INSERT INTO users (full_name, email, password_hash, role, is_active)
VALUES ('Gudara Admin', 'admin@gudara.id', 'pbkdf2$100000$i239wq/echOFSeoom/alxA==$x9rlnWsDZ/IwyL2IHJOZU0HYfpKFBsbAwFD2LS/CX1o=', 'admin', 1)
ON CONFLICT(email) DO UPDATE SET
  full_name = excluded.full_name,
  password_hash = excluded.password_hash,
  role = excluded.role,
  is_active = 1,
  updated_at = datetime('now');