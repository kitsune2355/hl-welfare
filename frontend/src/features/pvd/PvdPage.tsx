import { Download, HandCoins, PiggyBank, Users, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useApi } from '../../app/ApiContext';
import { downloadCsv } from '../../shared/csv';
import { int, money, thaiDate } from '../../shared/format';
import { useAsync } from '../../shared/hooks/useAsync';
import { EMPLOYEE_TYPE_LABEL, STATUS_LABEL, STATUS_TONE } from '../../shared/labels';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, PageHeader, Progress, Skeleton, StatCard, Table, Tabs } from '../../ui';
import { EmployeeCell } from '../common';

type View = 'members' | 'waiting' | 'left';

export function PvdPage() {
  const { api } = useApi();
  const nav = useNavigate();
  const rows = useAsync(() => api.listPvdMembers(), [api]);
  const rules = useAsync(() => api.getRules(), [api]);
  const [view, setView] = useState<View>('members');

  const groups = useMemo(() => {
    const all = rows.data ?? [];
    return {
      members: all.filter((r) => r.employee.status === 'ACTIVE' && r.pvd.memberYears !== null),
      waiting: all.filter((r) => r.employee.status === 'ACTIVE' && r.pvd.memberYears === null),
      left: all.filter((r) => r.employee.status === 'INACTIVE'),
    };
  }, [rows.data]);

  const sumEmp = groups.members.reduce((s, r) => s + r.pvd.employeeMonthly, 0);
  const sumCo = groups.members.reduce((s, r) => s + r.pvd.companyMonthly, 0);
  const shown = groups[view];

  const exportCsv = () =>
    downloadCsv(
      'pvd-members.csv',
      ['รหัสพนักงาน', 'ชื่อ', 'นามสกุล', 'บริษัท', 'ประเภท', 'สถานะ', 'วันเป็นสมาชิก', 'เงินเดือน', 'หักพนักงาน', 'สมทบบริษัท', 'อายุสมาชิก (ปี)', 'vesting %'],
      (rows.data ?? []).map(({ employee: e, pvd: p }) => [e.empCode, e.firstName, e.lastName, e.companyCode, EMPLOYEE_TYPE_LABEL[e.employeeType], STATUS_LABEL[e.status], p.joinDate, e.salary.toFixed(2), p.employeeMonthly.toFixed(2), p.companyMonthly.toFixed(2), p.memberYears, p.vestingPercent]),
    );

  if (rows.error) return <ErrorState error={rows.error} onRetry={rows.reload} />;

  return (
    <>
      <PageHeader
        title="กองทุนสำรองเลี้ยงชีพ"
        description="สิทธิสมาชิก ยอดหักสะสม/สมทบ และ % สิทธิในเงินสมทบ (vesting)"
        actions={
          <Button icon={<Download />} onClick={exportCsv} disabled={!rows.data?.length}>
            ส่งออก CSV
          </Button>
        }
      />

      {rules.data?.settings.pvdVestingIsPlaceholder && (
        <Alert tone="warning" className="mb-6" title="ตาราง vesting เป็นค่าตัวอย่าง">
          {rules.data.settings.pvdVesting.map((v) => `${v.minYears} ปี → ${v.percent}%`).join(' · ')} — รอ HR ยืนยันตารางจริง
        </Alert>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {rows.loading ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[124px] rounded-xl" />)
        ) : (
          <>
            <StatCard label="สมาชิกปัจจุบัน" value={int(groups.members.length)} hint={`รอเข้าเป็นสมาชิก ${groups.waiting.length} คน`} icon={<Users />} />
            <StatCard label={`พนักงานหัก ${rules.data?.settings.pvdEmployeeRate ?? 2}% รวม/เดือน`} value={money(sumEmp)} hint="บาท" icon={<Wallet />} tone="info" />
            <StatCard label={`บริษัทสมทบ ${rules.data?.settings.pvdCompanyRate ?? 2}% รวม/เดือน`} value={money(sumCo)} hint="บาท" icon={<HandCoins />} tone="success" />
          </>
        )}
      </div>

      <Card padded={false}>
        <div className="px-4 pt-2">
          <Tabs<View>
            value={view}
            onChange={setView}
            items={[
              { value: 'members', label: 'สมาชิก', count: groups.members.length },
              { value: 'waiting', label: 'รอครบสิทธิ', count: groups.waiting.length },
              { value: 'left', label: 'พ้นสภาพ', count: groups.left.length },
            ]}
          />
        </div>
        <Table
          key={view}
          pageSize={25}
          loading={rows.loading}
          rows={rows.data ? shown : undefined}
          rowKey={(r) => r.employee.id}
          onRowClick={(r) => nav(`/employees/${r.employee.id}`)}
          columns={[
            { key: 'emp', header: 'พนักงาน', cell: (r) => <EmployeeCell e={r.employee} /> },
            { key: 'type', header: 'บริษัท / ประเภท', hideOnMobile: true, cell: (r) => `${r.employee.companyCode} · ${EMPLOYEE_TYPE_LABEL[r.employee.employeeType]}` },
            { key: 'join', header: 'วันเป็นสมาชิก', cell: (r) => <span className="num">{thaiDate(r.pvd.joinDate)}</span> },
            { key: 'sal', header: 'เงินเดือน', align: 'right', hideOnMobile: true, cell: (r) => <span className="num">{money(r.employee.salary)}</span> },
            { key: 'ded', header: 'หัก', align: 'right', cell: (r) => <span className="num">{money(r.pvd.employeeMonthly)}</span> },
            { key: 'con', header: 'สมทบ', align: 'right', cell: (r) => <span className="num">{money(r.pvd.companyMonthly)}</span> },
            { key: 'yrs', header: 'อายุสมาชิก', align: 'right', cell: (r) => <span className="num">{r.pvd.memberYears === null ? '–' : `${r.pvd.memberYears} ปี`}</span> },
            {
              key: 'vest',
              header: 'Vesting',
              className: 'w-36',
              cell: (r) =>
                view === 'left' ? (
                  <span className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[r.employee.status]}>{r.pvd.vestingPercent ?? 0}%</Badge>
                  </span>
                ) : r.pvd.vestingPercent === null ? (
                  <span className="text-muted">–</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Progress value={r.pvd.vestingPercent} tone={r.pvd.vestingPercent >= 100 ? 'success' : 'primary'} />
                    <span className="num w-10 text-right text-xs">{r.pvd.vestingPercent}%</span>
                  </div>
                ),
            },
          ]}
          empty={<EmptyState icon={<PiggyBank />} title="ไม่มีรายการ" />}
        />
      </Card>
    </>
  );
}
