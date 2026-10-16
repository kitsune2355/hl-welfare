import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppShell } from './layout/AppShell';

const page = <T extends Record<string, React.ComponentType>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] }));

const DashboardPage = page(() => import('../features/dashboard/DashboardPage'), 'DashboardPage');
const EmployeesPage = page(() => import('../features/employees/EmployeesPage'), 'EmployeesPage');
const EmployeeDetailPage = page(() => import('../features/employees/EmployeeDetailPage'), 'EmployeeDetailPage');
const EmployeeFormPage = page(() => import('../features/employees/EmployeeFormPage'), 'EmployeeFormPage');
const InsurancePage = page(() => import('../features/insurance/InsurancePage'), 'InsurancePage');
const PvdPage = page(() => import('../features/pvd/PvdPage'), 'PvdPage');
const UniformPage = page(() => import('../features/uniform/UniformPage'), 'UniformPage');
const RulesPage = page(() => import('../features/rules/RulesPage'), 'RulesPage');
const SitesPage = page(() => import('../features/sites/SitesPage'), 'SitesPage');
const MonitorPage = page(() => import('../features/monitor/MonitorPage'), 'MonitorPage');
const NotFoundPage = page(() => import('../features/NotFoundPage'), 'NotFoundPage');

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'monitor', element: <MonitorPage /> },
      { path: 'employees', element: <EmployeesPage /> },
      { path: 'employees/new', element: <EmployeeFormPage /> },
      { path: 'employees/:id', element: <EmployeeDetailPage /> },
      { path: 'employees/:id/edit', element: <EmployeeFormPage /> },
      { path: 'insurance', element: <InsurancePage /> },
      { path: 'pvd', element: <PvdPage /> },
      { path: 'uniform', element: <UniformPage /> },
      { path: 'rules', element: <RulesPage /> },
      { path: 'sites', element: <SitesPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
