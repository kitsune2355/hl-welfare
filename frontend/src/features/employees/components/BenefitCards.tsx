import { PiggyBank, ShieldPlus } from 'lucide-react';
import type { Employee, InsuranceStatus, ISODate, PvdStatus, Settings } from '../../../domain/types';
import { money, relativeDays, thaiDate } from '../../../shared/format';
import { Alert, Badge, Card, InfoList, Progress } from '../../../ui';
import { Timeline, type TimelineStep } from './Timeline';

function Reasons({ reasons }: { reasons: string[] }) {
  return (
    <ul className="space-y-1.5 text-[13px] text-muted">
      {reasons.map((r) => (
        <li key={r} className="flex gap-2">
          <span className="mt-[7px] size-1 shrink-0 rounded-full bg-danger" />
          {r}
        </li>
      ))}
    </ul>
  );
}

export function InsuranceCard({ emp, st, today }: { emp: Employee; st: InsuranceStatus; today: ISODate }) {
  let badge = <Badge tone="danger" size="lg">ไม่มีสิทธิ</Badge>;
  if (st.eligible) {
    if (st.exitUrgent) badge = <Badge tone="danger" size="lg">แจ้งออกทันที</Badge>;
    else if (st.exitDate) badge = <Badge tone="warning" size="lg">แจ้งออก</Badge>;
    else if (st.eligibleDate && st.eligibleDate > today) badge = <Badge tone="info" size="lg">รอครบสิทธิ</Badge>;
    else badge = <Badge tone="success" size="lg">มีสิทธิ</Badge>;
  }

  const steps: TimelineStep[] = [
    { label: 'เริ่มงาน', date: emp.startDate },
    { label: 'ครบอายุงาน', date: st.eligibleDate },
    { label: 'รอบแจ้งเข้า', date: st.enrollCycleDate },
  ];
  if (st.exitDate) {
    steps.push({ label: 'วันมีผลออก', date: st.exitDate, tone: st.exitUrgent ? 'danger' : 'warning' });
    if (!st.exitUrgent) steps.push({ label: 'รอบแจ้งออก', date: st.exitCycleDate, tone: 'warning' });
  }

  return (
    <Card title="ประกันกลุ่ม" icon={<ShieldPlus />} actions={badge}>
      {st.eligible ? (
        <div className="space-y-4">
          {st.enrollCycleDate && st.enrollCycleDate >= today && !st.exitDate && (
            <p className="text-[13px] text-muted">
              แจ้งเข้า <span className="font-medium text-fg">{thaiDate(st.enrollCycleDate)}</span> · {relativeDays(st.enrollCycleDate, today)}
            </p>
          )}
          {st.exitUrgent && (
            <Alert tone="danger" title="ต้องแจ้งออกทันที">
              เลิกจ้าง/กระทำผิด — ไม่รอรอบวันที่ 5
            </Alert>
          )}
          <Timeline steps={steps} today={today} />
        </div>
      ) : (
        <Reasons reasons={st.reasons} />
      )}
    </Card>
  );
}

export function PvdCard({ st, settings }: { st: PvdStatus; settings: Settings }) {
  const joined = st.memberYears !== null;
  const badge = !st.eligible ? (
    <Badge tone="danger" size="lg">ไม่มีสิทธิ</Badge>
  ) : joined ? (
    <Badge tone="success" size="lg">เป็นสมาชิก</Badge>
  ) : (
    <Badge tone="info" size="lg">รอครบสิทธิ</Badge>
  );

  return (
    <Card title="กองทุนสำรองเลี้ยงชีพ" icon={<PiggyBank />} actions={badge}>
      {!st.eligible ? (
        <Reasons reasons={st.reasons} />
      ) : (
        <div className="space-y-5">
          <InfoList
            items={[
              { label: 'วันเป็นสมาชิก', value: thaiDate(st.joinDate) },
              { label: 'อายุสมาชิก', value: joined ? `${st.memberYears} ปี` : '–' },
              { label: `พนักงานหัก ${settings.pvdEmployeeRate}%`, value: <span className="num">{money(st.employeeMonthly)} ฿/เดือน</span> },
              { label: `บริษัทสมทบ ${settings.pvdCompanyRate}%`, value: <span className="num">{money(st.companyMonthly)} ฿/เดือน</span> },
            ]}
          />
          {st.vestingPercent !== null && (
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[13px]">
                <span className="text-muted">สิทธิในเงินสมทบ (vesting)</span>
                <span className="num font-semibold">{st.vestingPercent}%</span>
              </div>
              <Progress value={st.vestingPercent} tone={st.vestingPercent >= 100 ? 'success' : 'primary'} />
              {settings.pvdVestingIsPlaceholder && <p className="mt-1.5 text-xs text-warning">ตาราง vesting เป็นค่าตัวอย่าง รอ HR ยืนยัน</p>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
