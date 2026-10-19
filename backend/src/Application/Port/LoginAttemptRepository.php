<?php
declare(strict_types=1);

namespace App\Application\Port;

/** ตาราง auth_login_attempts — ใช้จำกัดการเดารหัสผ่าน */
interface LoginAttemptRepository
{
    public function record(string $username, string $ip, bool $succeeded, \DateTimeImmutable $at): void;

    /** จำนวนครั้งที่ผิดของชื่อผู้ใช้นี้ ตั้งแต่ $since (นับเฉพาะหลังการเข้าสำเร็จครั้งล่าสุด) */
    public function failuresForUsername(string $username, \DateTimeImmutable $since): int;

    public function failuresForIp(string $ip, \DateTimeImmutable $since): int;
}
