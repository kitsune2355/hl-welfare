import { CalendarClock, PiggyBank, Shirt, ShieldAlert, ShieldPlus, Users } from 'lucide-react';
import { useApi } from '../../app/ApiContext';
import { thaiDate, thaiDateLong, relativeDays, int } from '../../shared/format';
import { useAsync } from '../../shared/hooks/useAsync';
import { Alert, Badge, ButtonLink, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, Table } from '../../ui';
import { EmployeeCell } from '../common';

const COMPANY_COLOR: Record<string, string> = { HL: '#6366f1', PRO: '#0ea5e9', CNS: '#10b981', CIC: '#f59e0b', AS: '#ec4899' };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
}

export function DashboardPage() {
  const { api } = useApi();
  const { data, error, loading, reload } = useAsync(() => api.getDashboard(), [api]);

  if (error) return <ErrorState error={error} onRetry={reload} />;

  const max = Math.max(1, ...(data?.activeByCompany.map((c) => c.count) ?? [1]));

  return (
    <>
      <PageHeader title={`${greeting()} 👋`} description={data ? `ภาพรวมสวัสดิการ ณ ${thaiDateLong(data.today)}` : 'กำลังโหลด…'} />

      {data && data.urgentPending > 0 && (
        <Alert
          tone="danger"
          className="mb-6"
          title={`มีพนักงาน ${data.urgentPending} รายที่ต้องแจ้งออกจากประกันกลุ่มทันที`}
          action={
            <ButtonLink to="/insurance" size="sm" variant="danger">
              ไปส่งแจ้ง
            </ButtonLink>
          }
        >
          กรณีเลิกจ้าง / กระทำผิด ต้องแจ้งบริษัทประกันโดยไม่รอรอบวันที่ 5
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !data ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[124px] rounded-xl" />)
        ) : (
          <>
            <StatCard label="พนักงานปัจจุบัน" value={int(data.activeTotal)} hint="ทุกบริษัทในเครือ" icon={<Users />} tone="primary" to="/employees?status=ACTIVE" />
            <StatCard
              label={`รอบแจ้งประกัน ${thaiDate(data.nextCycleDate)}`}
              value={
                <span className="flex items-baseline gap-3">
                  <span>
                    {data.nextCycleIn}
                    <span className="ml-1 text-sm font-medium text-muted">เข้า</span>
                  </span>
                  <span>
                    {data.nextCycleOut}
                    <span className="ml-1 text-sm font-medium text-muted">ออก</span>
                  </span>
                </span>
              }
              hint={relativeDays(data.nextCycleDate, data.today)}
              icon={<ShieldPlus />}
              tone="info"
              to="/insurance"
            />
            <StatCard
              label="แจ้งออกทันทีค้าง"
              value={data.urgentPending}
              hint={data.urgentPending ? 'ต้องดำเนินการวันนี้' : 'ไม่มีรายการค้าง'}
              icon={<ShieldAlert />}
              tone={data.urgentPending ? 'danger' : 'success'}
              to="/insurance"
            />
            <StatCard label="ชุดฟอร์มค้างแจก" value={data.uniformPending} hint="รายการที่ถึงกำหนดแล้ว" icon={<Shirt />} tone="warning" to="/uniform" />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card title="พนักงานแยกบริษัท" description="เฉพาะที่ทำงานอยู่" className="lg:col-span-2">
          {!data ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-6" />
              ))}
            </div>
          ) : (
            <ul className="space-y-4">
              {data.activeByCompany.map((c) => (
                <li key={c.companyCode}>
                  <div className="mb-1.5 flex items-center justify-between text-[13px]">
                    <span className="font-medium">{c.companyCode}</span>
                    <span className="num text-muted">{int(c.count)} คน</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(c.count / max) * 100}%`, background: COMPANY_COLOR[c.companyCode] }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="จะครบสิทธิใน 30 วัน"
          description="ประกันกลุ่ม / กองทุนสำรองเลี้ยงชีพ"
          icon={<CalendarClock />}
          className="lg:col-span-3"
          padded={false}
        >
          <Table
            loading={loading}
            rows={data?.upcomingEligible}
            rowKey={(r) => `${r.employee.id}-${r.benefit}`}
            columns={[
              { key: 'emp', header: 'พนักงาน', cell: (r) => <EmployeeCell e={r.employee} link /> },
              {
                key: 'benefit',
                header: 'สิทธิ',
                cell: (r) =>
                  r.benefit === 'INSURANCE' ? (
                    <Badge tone="info">ประกันกลุ่ม</Badge>
                  ) : (
                    <Badge tone="primary">
                      <PiggyBank className="size-3" /> PVD
                    </Badge>
                  ),
              },
              {
                key: 'date',
                header: 'วันที่ครบ',
                align: 'right',
                cell: (r) => (
                  <div className="leading-tight">
                    <p className="num font-medium">{thaiDate(r.date)}</p>
                    <p className="text-xs text-muted">{data && relativeDays(r.date, data.today)}</p>
                  </div>
                ),
              },
            ]}
            empty={<EmptyState icon={<CalendarClock />} title="ไม่มีพนักงานที่จะครบสิทธิใน 30 วัน" />}
          />
        </Card>
      </div>
    </>
  );
}
