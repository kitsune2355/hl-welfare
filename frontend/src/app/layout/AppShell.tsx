import {
  BookOpenText,
  Building2,
  LayoutDashboard,
  ListChecks,
  Menu,
  Moon,
  PiggyBank,
  RotateCcw,
  Search,
  Shirt,
  ShieldPlus,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import type { DashboardData } from '../../domain/types';
import { cn } from '../../shared/cn';
import { useTheme } from '../../shared/hooks/useTheme';
import { Badge, IconButton, Skeleton, useToast } from '../../ui';
import { useApi } from '../ApiContext';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  count?: (d: DashboardData) => number;
  countTone?: 'danger' | 'warning';
}

const MAIN: NavItem[] = [
  { to: '/', label: 'ภาพรวม', icon: <LayoutDashboard /> },
  { to: '/monitor', label: 'ศูนย์ติดตามงาน', icon: <ListChecks /> },
  { to: '/employees', label: 'พนักงาน', icon: <Users /> },
  { to: '/insurance', label: 'ประกันกลุ่ม', icon: <ShieldPlus />, count: (d) => d.urgentPending, countTone: 'danger' },
  { to: '/pvd', label: 'กองทุนสำรองฯ', icon: <PiggyBank /> },
  { to: '/uniform', label: 'ชุดฟอร์ม', icon: <Shirt />, count: (d) => d.uniformPending, countTone: 'warning' },
];
const SETTINGS: NavItem[] = [
  { to: '/rules', label: 'เงื่อนไขสวัสดิการ', icon: <BookOpenText /> },
  { to: '/sites', label: 'หน่วยงาน', icon: <Building2 /> },
];

function Sidebar({ counts, onNavigate }: { counts?: DashboardData; onNavigate: () => void }) {
  const { api, mode } = useApi();
  const toast = useToast();

  const reset = async () => {
    if (!api.reset || !confirm('รีเซ็ตข้อมูลจำลองทั้งหมดกลับเป็นค่าตั้งต้น?')) return;
    await api.reset();
    toast.success('รีเซ็ตข้อมูลจำลองแล้ว');
    setTimeout(() => location.reload(), 400);
  };

  const link = (n: NavItem) => {
    const c = counts && n.count ? n.count(counts) : 0;
    return (
      <NavLink
        key={n.to}
        to={n.to}
        end={n.to === '/'}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors [&>svg]:size-[18px]',
            isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg',
          )
        }
      >
        {n.icon}
        <span className="flex-1">{n.label}</span>
        {c > 0 && (
          <span className={cn('num rounded-full px-2 py-px text-[11px] font-semibold text-white', n.countTone === 'danger' ? 'bg-danger' : 'bg-warning')}>
            {c}
          </span>
        )}
      </NavLink>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-9" />
        <div className="leading-tight">
          <p className="font-semibold">HL Welfare</p>
          <p className="text-xs text-muted">ระบบสวัสดิการพนักงาน</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="เมนูหลัก">
        {MAIN.map(link)}
        <p className="px-3 pt-5 pb-1.5 text-[11px] font-semibold tracking-wider text-muted/80 uppercase">ตั้งค่า</p>
        {SETTINGS.map(link)}
      </nav>
      <div className="space-y-2 border-t border-border p-4">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>แหล่งข้อมูล</span>
          {mode === 'mock' ? <Badge tone="warning">Mock data</Badge> : <Badge tone="success">API</Badge>}
        </div>
        {mode === 'mock' && api.reset && (
          <button onClick={reset} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2 text-xs text-muted transition-colors hover:border-muted hover:text-fg">
            <RotateCcw className="size-3.5" /> รีเซ็ตข้อมูลจำลอง
          </button>
        )}
      </div>
    </div>
  );
}

function GlobalSearch() {
  const nav = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <form
      role="search"
      className="relative w-full max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        nav(`/employees?q=${encodeURIComponent(q.trim())}`);
        setQ('');
        ref.current?.blur();
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ค้นหาพนักงาน (รหัส / ชื่อ)"
        aria-label="ค้นหาพนักงาน"
        className="h-9 w-full rounded-lg border border-border bg-surface-2/60 pr-10 pl-9 text-sm placeholder:text-muted focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring focus:outline-none"
      />
      <kbd className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-border bg-surface px-1.5 text-[11px] text-muted max-sm:hidden">/</kbd>
    </form>
  );
}

function PageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

export function AppShell() {
  const { api } = useApi();
  const { isDark, toggle } = useTheme();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [counts, setCounts] = useState<DashboardData>();

  // ตัวนับงานค้างในเมนู — โหลดใหม่ทุกครั้งที่เปลี่ยนหน้า
  useEffect(() => {
    let alive = true;
    api.getDashboard().then((d) => alive && setCounts(d), () => {});
    return () => {
      alive = false;
    };
  }, [api, location.key]);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-surface lg:block">
        <Sidebar counts={counts} onNavigate={() => {}} />
      </aside>

      {/* Drawer (mobile) */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="animate-pop absolute inset-y-0 left-0 w-72 border-r border-border bg-surface shadow-xl">
            <IconButton label="ปิดเมนู" onClick={() => setDrawer(false)} className="absolute top-4 right-3">
              <X />
            </IconButton>
            <Sidebar counts={counts} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <IconButton label="เปิดเมนู" onClick={() => setDrawer(true)} className="lg:hidden">
          <Menu />
        </IconButton>
        <GlobalSearch />
        <div className="ml-auto flex items-center gap-1">
          <IconButton label={isDark ? 'โหมดสว่าง' : 'โหมดมืด'} onClick={toggle}>
            {isDark ? <Sun /> : <Moon />}
          </IconButton>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
