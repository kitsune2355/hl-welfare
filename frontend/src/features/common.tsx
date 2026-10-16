import { Link } from 'react-router';
import type { Employee } from '../domain/types';
import { Avatar } from '../ui';

/** Avatar + ชื่อ-สกุล + รหัส — ใช้ในทุกตารางที่มีพนักงาน */
export function EmployeeCell({ e, link = false }: { e: Employee; link?: boolean }) {
  const name = `${e.firstName} ${e.lastName}`;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={e.firstName} size="sm" />
      <div className="min-w-0 leading-tight">
        {link ? (
          <Link to={`/employees/${e.id}`} className="truncate font-medium hover:text-primary hover:underline" onClick={(ev) => ev.stopPropagation()}>
            {name}
          </Link>
        ) : (
          <p className="truncate font-medium">{name}</p>
        )}
        <p className="num text-xs text-muted">{e.empCode}</p>
      </div>
    </div>
  );
}

export const fullName = (e: Employee) => `${e.firstName} ${e.lastName}`;
