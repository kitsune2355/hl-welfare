import { Building2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useApi } from '../../app/ApiContext';
import { errorMessage } from '../../application/errors';
import type { CompanyCode, Site } from '../../domain/types';
import { useAsync } from '../../shared/hooks/useAsync';
import { COMPANY_CODES } from '../../shared/labels';
import { Badge, Button, Card, DataGrid, EmptyState, ErrorState, Modal, PageHeader, useToast, type GridColumn } from '../../ui';

const POLO: Record<Site['poloColor'], { label: string; swatch: string }> = {
  BLACK: { label: 'ดำ', swatch: '#111827' },
  NAVY: { label: 'น้ำเงิน', swatch: '#1e3a8a' },
};

export function SitesPage() {
  const { api } = useApi();
  const toast = useToast();
  const sites = useAsync(() => api.listSites(), [api]);
  const [confirmDelete, setConfirmDelete] = useState<Site | null>(null);
  const [deleting, setDeleting] = useState(false);

  const columns: GridColumn<Site>[] = [
    {
      key: 'companyCode',
      header: 'บริษัท',
      width: 100,
      required: true,
      editor: 'select',
      // หน่วยงานที่สร้างแล้วย้ายบริษัทไม่ได้ (พนักงานผูกอยู่) — เลือกได้ตอนสร้างเท่านั้น
      editable: (s) => s.id === 0,
      value: (s) => s.companyCode,
      options: () => COMPANY_CODES.map((c) => ({ value: c, label: c })),
      set: (s, v) => ({ ...s, companyCode: String(v) as CompanyCode }),
    },
    { key: 'name', header: 'ชื่อหน่วยงาน', width: 320, required: true, editor: 'text', value: (s) => s.name, set: (s, v) => ({ ...s, name: String(v ?? '').trim() }) },
    {
      key: 'hasGroupInsurance',
      header: 'ได้รับประกันกลุ่ม',
      width: 150,
      align: 'center',
      editor: 'switch',
      value: (s) => s.hasGroupInsurance,
      set: (s, v) => ({ ...s, hasGroupInsurance: !!v }),
    },
    {
      key: 'poloColor',
      header: 'สีโปโล',
      width: 130,
      editor: 'select',
      value: (s) => s.poloColor,
      display: (s) => (
        <span className="flex items-center gap-2">
          <span className="size-3.5 rounded-full ring-1 ring-border" style={{ background: POLO[s.poloColor].swatch }} />
          {POLO[s.poloColor].label}
        </span>
      ),
      options: () => Object.entries(POLO).map(([value, p]) => ({ value, label: p.label })),
      set: (s, v) => ({ ...s, poloColor: v === 'NAVY' ? 'NAVY' : 'BLACK' }),
    },
    { key: 'id', header: 'รหัส', width: 70, align: 'right', value: (s) => (s.id ? s.id : ''), display: (s) => <span className="num">{s.id ? `#${s.id}` : '–'}</span> },
  ];

  const save = async (row: Site, isNew: boolean) => {
    if (isNew) {
      const { id: _id, ...input } = row;
      const created = await api.createSite(input);
      sites.setData((xs) => [...(xs ?? []), created]);
      toast.success(`เพิ่มหน่วยงาน “${created.name}” แล้ว`);
    } else {
      const updated = await api.updateSite(row.id, { name: row.name, hasGroupInsurance: row.hasGroupInsurance, poloColor: row.poloColor });
      sites.setData((xs) => xs?.map((x) => (x.id === updated.id ? updated : x)));
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.deleteSite(confirmDelete.id);
      sites.setData((xs) => xs?.filter((x) => x.id !== confirmDelete.id));
      toast.success(`ลบหน่วยงาน “${confirmDelete.name}” แล้ว`);
      setConfirmDelete(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  const sorted = sites.data ? [...sites.data].sort((a, b) => COMPANY_CODES.indexOf(a.companyCode) - COMPANY_CODES.indexOf(b.companyCode) || a.id - b.id) : undefined;
  const withoutInsurance = sites.data?.filter((s) => !s.hasGroupInsurance).length ?? 0;

  if (sites.error) return <ErrorState error={sites.error} onRetry={sites.reload} />;

  return (
    <>
      <PageHeader
        title="หน่วยงาน"
        description="เพิ่ม / แก้ไขในตารางได้ทันที — สวิตช์ประกันกลุ่มใช้กับแม่บ้าน CNS · สีโปโลใช้กับ Pro Site"
        actions={sites.data && <Badge tone={withoutInsurance ? 'warning' : 'success'}>ไม่ได้รับประกัน {withoutInsurance} หน่วยงาน</Badge>}
      />

      <Card padded={false}>
        <DataGrid
          columns={columns}
          rows={sorted}
          rowKey={(s) => s.id}
          loading={sites.loading}
          validate={(s) => (s.name.trim() ? {} : { name: 'กรุณาระบุชื่อหน่วยงาน' })}
          onSave={save}
          newRow={(): Site => ({ id: 0, companyCode: 'HL', name: '', hasGroupInsurance: true, poloColor: 'BLACK' })}
          addLabel="เพิ่มหน่วยงาน"
          onDelete={setConfirmDelete}
          empty={<EmptyState icon={<Building2 />} title="ยังไม่มีหน่วยงาน" />}
        />
      </Card>

      <Modal
        open={!!confirmDelete}
        onClose={() => !deleting && setConfirmDelete(null)}
        title="ลบหน่วยงาน?"
        description={confirmDelete ? `${confirmDelete.name} (${confirmDelete.companyCode})` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              ยกเลิก
            </Button>
            <Button variant="danger" icon={<Trash2 />} loading={deleting} onClick={doDelete}>
              ลบ
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">ลบได้เฉพาะหน่วยงานที่ไม่มีพนักงานอยู่ — ถ้ายังมีพนักงาน ให้ย้ายหน่วยงานก่อน</p>
      </Modal>
    </>
  );
}
