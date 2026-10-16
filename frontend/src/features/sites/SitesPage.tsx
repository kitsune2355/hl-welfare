import { Building2 } from 'lucide-react';
import { useApi } from '../../app/ApiContext';
import { errorMessage } from '../../application/errors';
import type { Site } from '../../domain/types';
import { cn } from '../../shared/cn';
import { useAsync } from '../../shared/hooks/useAsync';
import { COMPANY_CODES } from '../../shared/labels';
import { Badge, Card, ErrorState, PageHeader, Skeleton, Switch, useToast } from '../../ui';

const COLORS: { value: Site['poloColor']; label: string; swatch: string }[] = [
  { value: 'BLACK', label: 'ดำ', swatch: '#111827' },
  { value: 'NAVY', label: 'น้ำเงิน', swatch: '#1e3a8a' },
];

export function SitesPage() {
  const { api } = useApi();
  const toast = useToast();
  const sites = useAsync(() => api.listSites(), [api]);

  // optimistic update: เปลี่ยนบนจอก่อน ถ้าล้มเหลวค่อยย้อนค่า
  const patch = async (site: Site, change: Partial<Site>, msg: string) => {
    sites.setData((xs) => xs?.map((s) => (s.id === site.id ? { ...s, ...change } : s)));
    try {
      await api.updateSite(site.id, change);
      toast.success(msg);
    } catch (e) {
      sites.setData((xs) => xs?.map((s) => (s.id === site.id ? site : s)));
      toast.error(errorMessage(e));
    }
  };

  if (sites.error) return <ErrorState error={sites.error} onRetry={sites.reload} />;

  return (
    <>
      <PageHeader title="หน่วยงาน" description="ตั้งค่าหน่วยงานที่ได้รับประกันกลุ่ม (แม่บ้าน CNS) และสีโปโล (Pro Site) — บันทึกทันที" />

      {!sites.data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="space-y-6">
          {COMPANY_CODES.map((code) => {
            const list = sites.data!.filter((s) => s.companyCode === code);
            if (!list.length) return null;
            return (
              <Card key={code} title={code} description={`${list.length} หน่วยงาน`} icon={<Building2 />} padded={false}>
                <ul className="divide-y divide-border">
                  {list.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                      <div className="min-w-48 flex-1">
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted">รหัสหน่วยงาน #{s.id}</p>
                      </div>

                      <label className="flex items-center gap-3 text-[13px]">
                        <Switch
                          label={`${s.name} ได้รับประกันกลุ่ม`}
                          checked={s.hasGroupInsurance}
                          onChange={(v) => patch(s, { hasGroupInsurance: v }, `${s.name}: ${v ? 'ได้รับ' : 'ไม่ได้รับ'}ประกันกลุ่ม`)}
                        />
                        {s.hasGroupInsurance ? <Badge tone="success">ได้รับประกันกลุ่ม</Badge> : <Badge tone="neutral">ไม่ได้รับ</Badge>}
                      </label>

                      <div className="flex items-center gap-1.5" role="radiogroup" aria-label={`สีโปโล ${s.name}`}>
                        <span className="mr-1 text-xs text-muted">โปโล</span>
                        {COLORS.map((c) => (
                          <button
                            key={c.value}
                            role="radio"
                            aria-checked={s.poloColor === c.value}
                            onClick={() => s.poloColor !== c.value && patch(s, { poloColor: c.value }, `${s.name}: โปโลสี${c.label}`)}
                            className={cn(
                              'flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-xs transition-colors',
                              s.poloColor === c.value ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-border text-muted hover:text-fg',
                            )}
                          >
                            <span className="size-4 rounded-full ring-1 ring-white/30" style={{ background: c.swatch }} />
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
