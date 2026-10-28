-- Signed refresh JWTs exceed Prisma's default MySQL VARCHAR(191) mapping.
ALTER TABLE `Admin` MODIFY `refreshToken` TEXT NULL;
ALTER TABLE `SuperAdmin` MODIFY `refreshToken` TEXT NULL;
