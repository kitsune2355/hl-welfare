import { RouterProvider } from 'react-router';
import { ToastProvider } from '../ui';
import { ApiProvider } from './ApiContext';
import { router } from './router';

export function App() {
  return (
    <ApiProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </ApiProvider>
  );
}
