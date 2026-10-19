<?php
declare(strict_types=1);

namespace App\Domain;

/** ผู้ใช้ระบบ (ตาราง users) — ใช้เป็น "ผู้กระทำ" ของทุกการเขียนข้อมูลด้วย */
final class User
{
    public const ROLE_LABELS = [
        'HR_ADMIN' => 'HR Admin',
        'HR_COMPANY' => 'HR บริษัท',
        'PAYROLL' => 'Payroll',
        'STOCK' => 'ผู้ดูแลสต็อก',
        'EXECUTIVE' => 'ผู้บริหาร',
    ];

    public function __construct(
        public readonly int $id,
        public readonly string $username,
        public readonly string $name,
        public readonly string $role,
        public readonly ?string $empCode,
        public readonly bool $isActive,
        public readonly int $sessionVersion,
        public readonly string $passwordHash,
    ) {}

    /** รูปแบบที่ส่งให้หน้าเว็บ (ไม่มี hash) */
    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'username' => $this->username,
            'name' => $this->name,
            'role' => self::ROLE_LABELS[$this->role] ?? $this->role,
            'roleCode' => $this->role,
            'empCode' => $this->empCode,
        ];
    }
}
