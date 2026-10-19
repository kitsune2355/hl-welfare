<?php
declare(strict_types=1);

namespace App\Application\Port;

use App\Domain\User;

interface UserRepository
{
    public function findById(int $id): ?User;

    /** ชื่อผู้ใช้ไม่สนตัวพิมพ์เล็ก/ใหญ่ */
    public function findByUsername(string $username): ?User;

    public function updatePasswordHash(int $userId, string $hash, string $by): void;

    /** เปลี่ยนรหัสผ่าน + เพิ่ม session_version (session ทุกเครื่องของผู้ใช้นี้หมดอายุทันที) */
    public function changePassword(int $userId, string $hash, string $by): void;

    public function touchLastLogin(int $userId, \DateTimeImmutable $at): void;
}
