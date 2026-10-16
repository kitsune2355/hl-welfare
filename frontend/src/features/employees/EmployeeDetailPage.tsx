import { History, Pencil, UserX } from 'lucide-react';
import { useParams } from 'react-router';
import { useApi } from '../../app/ApiContext';
import { todayISO } from '../../domain/date';
import { tenure, thaiDate, money } from '../../shared/format';
import { useAsync } from '../../shared/hooks/useAsync';
import {
  CONTRACT_LABEL,
  EMPLOYEE_TYPE_LABEL,
  EMPLOYEE_TYPE_TONE,
  END_REASON_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
} from '../../shared/labels';
import { Avatar, Badge, ButtonLink, Card, EmptyState, ErrorState, InfoList, PageHeader, Skeleton } from '../../ui';
import { InsuranceCard, PvdCard } from './components/BenefitCards';
import { UniformCard } from './components/UniformCard';
import { ActivityFeed } from '../monitor/ActivityFeed';

export function EmployeeDetailPage() {
  const { id } = useParams();
  const { api } = useApi();
  const today = todayISO();
  const benefits = useAsync(() => api.getEmployeeBenefits(Number(id)), [api, id]);
  const rules = useAsync(() => api.getRules(), [api]);
  const activity = useAsync(() => api.listActivity({ employeeId: Number(id), limit: 30 }), [api, id]);

  if (benefits.error) {
    const notFound = (benefits.error as { status?: number }).status === 404;
    return notFound ? (
      <Card>
        <EmptyState icon={<UserX />} title="ไม่พบพนักงาน" action={<ButtonLink to="/employees">กลับไปหน้ารายชื่อ</ButtonLink>} />
      </Card>
    ) : (
      <ErrorState error={benefits.error} onRetry={benefits.reload} />
    );
  }

  const b = benefits.data;
  if (!b || !rules.data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full max-w-md" />
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const e = b.employee;
  const name = `${e.firstName} ${e.lastName}`;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'พนักงาน', to: '/employees' }, { label: name }]}
        title={
          <span className="flex items-center gap-4">
            <Avatar name={e.firstName} size="lg" />
            <span>
              <span className="flex flex-wrap items-center gap-2">
                {name}
                <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
              </span>
              <span className="num block text-sm font-normal text-muted">
                {e.empCode} · {EMPLOYEE_TYPE_LABEL[e.employeeType]} · {e.companyCode}
              </span>
            </span>
          </span>
        }
        actions={
          <ButtonLink to={`/employees/${e.id}/edit`} icon={<Pencil className="size-4" />}>
            {e.status === 'ACTIVE' ? 'แก้ไข / บันทึกพ้นสภาพ' : 'แก้ไข'}
          </ButtonLink>
        }
      />

      <Card className="mb-6">
        <InfoList
          cols={4}
          items={[
            { label: 'หน่วยงาน', value: b.site?.name ?? '–' },
            { label: 'ประเภท', value: <Badge tone={EMPLOYEE_TYPE_TONE[e.employeeType]} dot={false}>{EMPLOYEE_TYPE_LABEL[e.employeeType]}</Badge> },
            { label: e.employeeType === 'PRO_SITE' ? 'ตำแหน่ง' : 'ฝ่าย / ระดับ', value: e.position ?? (e.deptGroup ? `${e.deptGroup} · ระดับ ${e.level ?? '–'}` : '–') },
            { label: 'สัญญา', value: CONTRACT_LABEL[e.contractType] },
            { label: 'วันเริ่มงาน', value: thaiDate(e.startDate) },
            { label: 'ผ่านทดลองงาน', value: thaiDate(e.probationPassDate) },
            { label: 'อายุงาน', value: tenure(e.startDate, e.endDate ?? today) },
            { label: 'เงินเดือน', value: <span className="num">{money(e.salary)} ฿</span> },
            ...(e.status === 'INACTIVE'
              ? [
                  { label: 'เหตุผลพ้นสภาพ', value: e.endReason ? END_REASON_LABEL[e.endReason] : '–' },
                  { label: 'วันทำงานสุดท้าย', value: thaiDate(e.lastWorkingDate) },
                  { label: 'วันพ้นสภาพ', value: thaiDate(e.endDate) },
                ]
              : []),
          ]}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <InsuranceCard emp={e} st={b.insurance} today={today} />
        <PvdCard st={b.pvd} settings={rules.data.settings} />
      </div>

      <div className="mt-6">
        <UniformCard emp={e} st={b.uniform} today={today} onChange={() => (benefits.reload(), activity.reload())} />
      </div>

      <Card className="mt-6" padded={false} icon={<History />} title="ประวัติการเปลี่ยนแปลง" description="บันทึกกิจกรรมของพนักงานคนนี้">
        <ActivityFeed items={activity.data} loading={activity.loading} showEmployeeLink={false} />
      </Card>
    </>
  );
}
