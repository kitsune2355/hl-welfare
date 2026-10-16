import { FilterX, Plus, Search, UserX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useApi } from '../../app/ApiContext';
import type { CompanyCode, EmployeeFilter, EmployeeStatus, EmployeeType } from '../../domain/types';
import { thaiDate, int } from '../../shared/format';
import { useAsync } from '../../shared/hooks/useAsync';
import {
  COMPANY_CODES,
  EMPLOYEE_TYPE_LABEL,
  EMPLOYEE_TYPE_TONE,
  STATUS_LABEL,
  STATUS_TONE,
} from '../../shared/labels';
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, Input, PageHeader, Select, Table } from '../../ui';
import { EmployeeCell } from '../common';

export function EmployeesPage() {
  const { api } = useApi();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter: EmployeeFilter = {
    q: params.get('q') ?? '',
    companyCode: (params.get('company') ?? '') as CompanyCode | '',
    employeeType: (params.get('type') ?? '') as EmployeeType | '',
    status: (params.get('status') ?? '') as EmployeeStatus | '',
  };
  const [q, setQ] = useState(filter.q ?? '');

  // ค้นหาแบบ debounce 250ms แล้วเก็บลง URL
  useEffect(() => setQ(filter.q ?? ''), [filter.q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== (params.get('q') ?? '')) update('q', q);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const key = params.toString();
  const employees = useAsync(() => api.listEmployees(filter), [api, key]);
  const sites = useAsync(() => api.listSites(), [api]);
  const siteName = useMemo(() => new Map(sites.data?.map((s) => [s.id, s.name])), [sites.data]);
  const hasFilter = !!(filter.q || filter.companyCode || filter.employeeType || filter.status);

  return (
    <>
      <PageHeader
        title="พนักงาน"
        description="ทะเบียนพนักงานทุกบริษัทในเครือ — คลิกแถวเพื่อดูสิทธิสวัสดิการ"
        actions={
          <ButtonLink to="/employees/new" variant="primary" icon={<Plus className="size-4" />}>
            เพิ่มพนักงาน
          </ButtonLink>
        }
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัส หรือ ชื่อ-สกุล" aria-label="ค้นหา" className="pl-9" />
          </div>
          <Select aria-label="บริษัท" value={filter.companyCode} onChange={(e) => update('company', e.target.value)} className="w-36">
            <option value="">ทุกบริษัท</option>
            {COMPANY_CODES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select aria-label="ประเภท" value={filter.employeeType} onChange={(e) => update('type', e.target.value)} className="w-40">
            <option value="">ทุกประเภท</option>
            {Object.entries(EMPLOYEE_TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select aria-label="สถานะ" value={filter.status} onChange={(e) => update('status', e.target.value)} className="w-36">
            <option value="">ทุกสถานะ</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          {hasFilter && (
            <Button variant="ghost" size="md" icon={<FilterX />} onClick={() => (setQ(''), setParams({}, { replace: true }))}>
              ล้างตัวกรอง
            </Button>
          )}
        </div>

        {employees.error ? (
          <div className="p-4">
            <ErrorState error={employees.error} onRetry={employees.reload} />
          </div>
        ) : (
          <>
            <Table
              loading={employees.loading}
              rows={employees.data}
              rowKey={(e) => e.id}
              onRowClick={(e) => nav(`/employees/${e.id}`)}
              columns={[
                { key: 'name', header: 'พนักงาน', cell: (e) => <EmployeeCell e={e} /> },
                {
                  key: 'company',
                  header: 'บริษัท / หน่วยงาน',
                  cell: (e) => (
                    <div className="leading-tight">
                      <p className="font-medium">{e.companyCode}</p>
                      <p className="max-w-56 truncate text-xs text-muted">{siteName.get(e.siteId) ?? '–'}</p>
                    </div>
                  ),
                },
                { key: 'type', header: 'ประเภท', cell: (e) => <Badge tone={EMPLOYEE_TYPE_TONE[e.employeeType]} dot={false}>{EMPLOYEE_TYPE_LABEL[e.employeeType]}</Badge> },
                { key: 'role', header: 'ฝ่าย / ตำแหน่ง', hideOnMobile: true, cell: (e) => <span className="text-muted">{e.deptGroup ? `${e.deptGroup} · ระดับ ${e.level}` : (e.position ?? '–')}</span> },
                { key: 'start', header: 'เริ่มงาน', hideOnMobile: true, cell: (e) => <span className="num">{thaiDate(e.startDate)}</span> },
                { key: 'status', header: 'สถานะ', cell: (e) => <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge> },
              ]}
              empty={
                <EmptyState
                  icon={<UserX />}
                  title="ไม่พบพนักงาน"
                  description={hasFilter ? 'ลองเปลี่ยนคำค้นหรือล้างตัวกรอง' : 'ยังไม่มีพนักงานในระบบ'}
                  action={!hasFilter && <ButtonLink to="/employees/new" variant="primary">เพิ่มพนักงาน</ButtonLink>}
                />
              }
            />
            {employees.data && employees.data.length > 0 && (
              <div className="border-t border-border px-4 py-3 text-xs text-muted">แสดง {int(employees.data.length)} รายการ</div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
