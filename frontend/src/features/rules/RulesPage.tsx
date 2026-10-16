import { CircleHelp } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { useApi } from '../../app/ApiContext';
import { useAsync } from '../../shared/hooks/useAsync';
import { CONTRACT_LABEL, EMPLOYEE_TYPE_LABEL, UNIFORM_ITEM_LABEL } from '../../shared/labels';
import { Alert, Badge, Card, ErrorState, InfoList, PageHeader, Skeleton, Table, Tabs } from '../../ui';

type Tab = 'insurance' | 'pvd' | 'uniform' | 'settings' | 'open';

const OPEN_QUESTIONS = [
  '“ทำงานครบ 30/120 วัน” นับวันปฏิทินหรือวันทำงาน? นับวันเริ่มงานเป็นวันที่ 1 ไหม? (ระบบตอนนี้: วันเริ่มงาน + N วันปฏิทิน)',
  'ครบสิทธิหลังวันที่ 5 → เข้ารอบเดือนถัดไปใช่ไหม?',
  'อายุ 65 ตรวจเฉพาะตอนแจ้งเข้า หรือต้องแจ้งออกเมื่ออายุครบ 65 ระหว่างเป็นสมาชิกด้วย?',
  'ขาดงาน 3 วันแล้วกลับมาทำงาน → แจ้งเข้าใหม่ + นับอายุงานใหม่ไหม?',
  'พนักงานรายวัน CNS / CIC / PRO ได้ประกันกลุ่มไหม (ไฟล์ระบุแค่ HL, AS)?',
  'PVD: ตาราง vesting จริง และนิยาม “ลาออกถูกต้องตามระเบียบ”',
  'ชุดฟอร์มส่วนกลาง: ช่อง “วันเริ่มงาน” ว่าง = ไม่ได้จนกว่าจะผ่านทดลองงาน ใช่ไหม?',
  'ช่างทีมโมบาย “2+1” = ชุดช่าง 2 + โปโล 1 ใช่ไหม?',
  'แจกชุดประจำปีเดือนไหน และต้องทำงานครบกี่เดือนก่อนรอบแจก?',
  'CIC ระดับ 6 ขึ้นไป ได้ชุดฟอร์มกี่ตัว?',
  'แม่บ้าน CNS และพนักงานรายวัน ได้ชุดฟอร์มไหม?',
  'ระดับพนักงาน “6 ขึ้นไป” สูงสุดถึงระดับเท่าไร?',
];

const yes = <Badge tone="success">ได้รับ</Badge>;
const no = <Badge tone="danger">ไม่ได้รับ</Badge>;

export function RulesPage() {
  const { api } = useApi();
  const rules = useAsync(() => api.getRules(), [api]);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'insurance';

  if (rules.error) return <ErrorState error={rules.error} onRetry={rules.reload} />;
  const r = rules.data;

  return (
    <>
      <PageHeader title="เงื่อนไขสวัสดิการ" description="อ้างอิงไฟล์ “เงื่อนไขสวัสดิการ 15.10.69” — ดูอย่างเดียวในเฟส 1" />

      <Tabs<Tab>
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        items={[
          { value: 'insurance', label: 'ประกันกลุ่ม' },
          { value: 'pvd', label: 'กองทุนสำรองฯ' },
          { value: 'uniform', label: 'ชุดฟอร์ม' },
          { value: 'settings', label: 'ค่าตั้งค่า' },
          { value: 'open', label: 'รอ HR ยืนยัน', count: OPEN_QUESTIONS.length },
        ]}
      />

      {!r ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : tab === 'insurance' ? (
        <Card padded={false}>
          <Table
            rows={r.insurance}
            rowKey={(x) => x.id}
            columns={[
              { key: 'id', header: '#', cell: (x) => <span className="text-muted">{x.id}</span> },
              { key: 't', header: 'ประเภทพนักงาน', cell: (x) => <span className="font-medium">{EMPLOYEE_TYPE_LABEL[x.employeeType]}</span> },
              { key: 'c', header: 'บริษัท', cell: (x) => x.companies?.join(', ') ?? 'ทุกบริษัท' },
              { key: 'w', header: 'รอ (วัน)', align: 'right', cell: (x) => <span className="num">{x.waitDays}</span> },
              {
                key: 'x',
                header: 'เงื่อนไขเพิ่ม',
                cell: (x) => (
                  <span className="flex flex-wrap gap-1.5">
                    {x.excludeContracts.map((c) => (
                      <Badge key={c} tone="danger">ไม่รวม{CONTRACT_LABEL[c]}</Badge>
                    ))}
                    {x.requireSiteInsurance && <Badge tone="warning">เฉพาะหน่วยงานที่ได้รับ</Badge>}
                    {!x.excludeContracts.length && !x.requireSiteInsurance && <span className="text-muted">–</span>}
                  </span>
                ),
              },
              { key: 'n', header: 'หมายเหตุ', hideOnMobile: true, cell: (x) => <span className="text-muted">{x.note}</span> },
            ]}
          />
        </Card>
      ) : tab === 'pvd' ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card padded={false} className="lg:col-span-2" title="สิทธิสมาชิก">
            <Table
              rows={r.pvd}
              rowKey={(x) => x.id}
              columns={[
                { key: 't', header: 'ประเภท', cell: (x) => <span className="font-medium">{EMPLOYEE_TYPE_LABEL[x.employeeType]}</span> },
                { key: 'e', header: 'สิทธิ', cell: (x) => (x.eligible ? yes : no) },
                { key: 'w', header: 'รอ (วัน)', align: 'right', cell: (x) => (x.eligible ? <span className="num">{x.waitDays === 0 ? 'วันแรก' : x.waitDays}</span> : '–') },
                { key: 'n', header: 'หมายเหตุ', hideOnMobile: true, cell: (x) => <span className="text-muted">{x.note}</span> },
              ]}
            />
          </Card>
          <Card title="Vesting" description="% สิทธิในเงินสมทบตามอายุสมาชิก" className="self-start">
            {r.settings.pvdVestingIsPlaceholder && (
              <Alert tone="warning" className="mb-4">
                ค่าตัวอย่าง — รอ HR ยืนยัน
              </Alert>
            )}
            <ul className="space-y-2 text-[13px]">
              {r.settings.pvdVesting.map((v) => (
                <li key={v.minYears} className="flex justify-between">
                  <span className="text-muted">ตั้งแต่ {v.minYears} ปี</span>
                  <span className="num font-semibold">{v.percent}%</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">กระทำผิด / ขาดงาน 3 วัน → 0%</p>
          </Card>
        </div>
      ) : tab === 'uniform' ? (
        <Card padded={false}>
          <Table
            rows={r.uniform}
            rowKey={(x) => x.id}
            columns={[
              { key: 'id', header: '#', cell: (x) => <span className="text-muted">{x.id}</span> },
              { key: 't', header: 'ประเภท', cell: (x) => EMPLOYEE_TYPE_LABEL[x.employeeType] },
              { key: 'c', header: 'บริษัท', cell: (x) => x.companies.join(', ') },
              { key: 'g', header: 'กลุ่ม / ตำแหน่ง', cell: (x) => <span className="font-medium">{x.position ?? x.deptGroups?.join(', ') ?? '–'}</span> },
              { key: 'l', header: 'ระดับ', cell: (x) => (x.levelMin === null && x.levelMax === null ? (x.employeeType === 'CENTRAL' ? 'ทุกระดับ' : '–') : `${x.levelMin ?? 1}${x.levelMax ? `–${x.levelMax}` : '+'}`) },
              { key: 'i', header: 'รายการ', hideOnMobile: true, cell: (x) => <span className="text-muted">{x.items.map((i) => (x.poloBySite && i.startsWith('POLO') ? 'โปโล (สีตามหน่วยงาน)' : UNIFORM_ITEM_LABEL[i])).join(', ')}</span> },
              { key: 's', header: 'เริ่มงาน', align: 'right', cell: (x) => <span className="num">{x.qtyStartLabel ?? x.qtyStart}</span> },
              { key: 'p', header: 'ผ่านทดลอง', align: 'right', cell: (x) => <span className="num">{x.qtyProbation}</span> },
              { key: 'a', header: 'ประจำปี', align: 'right', cell: (x) => <span className="num">{x.qtyAnnual}</span> },
            ]}
          />
        </Card>
      ) : tab === 'settings' ? (
        <Card>
          <InfoList
            cols={3}
            items={[
              { label: 'อายุสูงสุดประกันกลุ่ม', value: `${r.settings.insuranceMaxAge} ปี` },
              { label: 'วันที่รอบแจ้งประกัน', value: `ทุกวันที่ ${r.settings.insuranceCycleDay}` },
              { label: 'ขาดงาน 3 วัน: วันออก', value: `วันทำงานสุดท้าย + ${r.settings.absentExtraDays} วัน` },
              { label: 'PVD พนักงานหัก', value: `${r.settings.pvdEmployeeRate}%` },
              { label: 'PVD บริษัทสมทบ', value: `${r.settings.pvdCompanyRate}%` },
              { label: 'เดือนแจกชุดประจำปี', value: `1 ${['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][r.settings.uniformAnnualMonth - 1]}` },
            ]}
          />
        </Card>
      ) : (
        <Card title="ประเด็นที่ต้องยืนยันกับ HR" icon={<CircleHelp />}>
          <ol className="list-decimal space-y-2.5 pl-5 text-[13px] marker:text-muted">
            {OPEN_QUESTIONS.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </Card>
      )}
    </>
  );
}
