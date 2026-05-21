-- Staff phone + client preferred contact method
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "preferredContactMethod" TEXT;
