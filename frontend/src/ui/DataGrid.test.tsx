// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Combobox } from './Combobox';
import { DataGrid, type GridColumn } from './DataGrid';
import { ToastProvider } from './Overlay';

interface Row {
  id: number;
  name: string;
  qty: number;
  color: string;
}

const columns: GridColumn<Row>[] = [
  { key: 'name', header: 'ชื่อ', width: 160, editor: 'text', required: true, value: (r) => r.name, set: (r, v) => ({ ...r, name: String(v ?? '') }) },
  { key: 'qty', header: 'จำนวน', width: 80, editor: 'number', value: (r) => r.qty, set: (r, v) => ({ ...r, qty: Number(v) }) },
  {
    key: 'color',
    header: 'สี',
    width: 120,
    editor: 'select',
    value: (r) => r.color,
    options: () => [
      { value: 'BLACK', label: 'ดำ' },
      { value: 'NAVY', label: 'น้ำเงิน' },
    ],
    set: (r, v) => ({ ...r, color: String(v) }),
  },
];

const rows: Row[] = [
  { id: 1, name: 'แถวหนึ่ง', qty: 1, color: 'BLACK' },
  { id: 2, name: 'แถวสอง', qty: 2, color: 'BLACK' },
];

const setup = (onSave = vi.fn().mockResolvedValue(undefined)) => {
  render(
    <ToastProvider>
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        validate={(r) => (r.name.trim() ? {} : { name: 'ต้องกรอกชื่อ' })}
        onSave={onSave}
        newRow={() => ({ id: 0, name: '', qty: 0, color: 'BLACK' })}
      />
    </ToastProvider>,
  );
  return { onSave, user: userEvent.setup() };
};

afterEach(cleanup);

describe('DataGrid (ตารางแบบ Excel)', () => {
  it('ดับเบิลคลิก → แก้ไข → Enter = บันทึกแถวนั้น', async () => {
    const { onSave, user } = setup();
    await user.dblClick(screen.getByText('แถวหนึ่ง'));
    const input = screen.getByRole('textbox', { name: 'ชื่อ' });
    await user.clear(input);
    await user.type(input, 'แก้แล้ว{Enter}');
    expect(onSave).toHaveBeenCalledWith({ ...rows[0], name: 'แก้แล้ว' }, false);
  });

  it('เลือกเซลล์แล้วพิมพ์ตัวเลข → เริ่มแก้ด้วยตัวที่พิมพ์ · Tab = บันทึก', async () => {
    const { onSave, user } = setup();
    await user.click(screen.getAllByRole('gridcell')[1]); // qty แถว 1
    await user.keyboard('9{Tab}');
    expect(onSave).toHaveBeenCalledWith({ ...rows[0], qty: 9 }, false);
  });

  it('Esc = ยกเลิก ไม่บันทึก', async () => {
    const { onSave, user } = setup();
    await user.dblClick(screen.getByText('แถวสอง'));
    await user.type(screen.getByRole('textbox', { name: 'ชื่อ' }), 'xxx{Escape}');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('แถวสอง')).toBeTruthy();
  });

  it('เซลล์ select: เปิดรายการ พิมพ์ค้นหา แล้ว Enter เลือก', async () => {
    const { onSave, user } = setup();
    await user.dblClick(screen.getAllByRole('gridcell')[2]); // สี แถว 1
    await user.type(screen.getByRole('textbox', { name: 'ค้นหาตัวเลือก' }), 'น้ำ{Enter}');
    expect(onSave).toHaveBeenCalledWith({ ...rows[0], color: 'NAVY' }, false);
  });

  it('เพิ่มแถว: ยังไม่ครบ = ไม่บันทึก · กรอกครบ = สร้างใหม่ (isNew)', async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole('button', { name: /เพิ่มแถว/ }));
    expect(screen.getByText('ใหม่')).toBeTruthy();
    // แก้ qty ก่อน — ชื่อยังว่าง จึงยังไม่บันทึก
    await user.keyboard('{ArrowRight}5{Enter}');
    expect(onSave).not.toHaveBeenCalled();
    await user.keyboard('{ArrowUp}{ArrowLeft}');
    await user.keyboard('ใหม่สด{Enter}');
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ id: 0, name: 'ใหม่สด', qty: 5, color: 'BLACK' }, true));
  });

  it('บันทึกล้มเหลว → แสดงข้อความ error ของแถว', async () => {
    const { user } = setup(vi.fn().mockRejectedValue(new Error('รหัสพนักงานซ้ำ')));
    await user.dblClick(screen.getByText('แถวหนึ่ง'));
    await user.type(screen.getByRole('textbox', { name: 'ชื่อ' }), 'X{Enter}');
    await user.click(screen.getByText('แถวหนึ่งX'));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('รหัสพนักงานซ้ำ'));
  });
});

describe('Combobox (select ค้นหาได้)', () => {
  it('พิมพ์เพื่อกรอง แล้วคลิกเลือก', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Combobox
        aria-label="บริษัท"
        value=""
        onChange={onChange}
        options={['HL', 'PRO', 'CNS', 'CIC', 'AS'].map((c) => ({ value: c, label: c }))}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'บริษัท' }));
    await user.type(screen.getByRole('textbox', { name: 'ค้นหาตัวเลือก' }), 'c');
    const list = screen.getByRole('listbox');
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['CNS', 'CIC']);
    await user.click(within(list).getByText('CIC'));
    expect(onChange).toHaveBeenCalledWith('CIC');
  });

  it('creatable: พิมพ์ค่าใหม่ที่ไม่มีในรายการได้', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Combobox aria-label="ตำแหน่ง" creatable value="" onChange={onChange} options={[{ value: 'วิศวกร', label: 'วิศวกร' }]} />);
    await user.click(screen.getByRole('combobox', { name: 'ตำแหน่ง' }));
    await user.type(screen.getByRole('textbox', { name: 'ค้นหาตัวเลือก' }), 'นักสำรวจ{Enter}');
    expect(onChange).toHaveBeenCalledWith('นักสำรวจ');
  });
});
