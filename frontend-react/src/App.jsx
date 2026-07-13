import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ChatCvScreen from './ChatCvScreen';
import AdminLoginScreen from './AdminLoginScreen';
import AdminLayout from './AdminLayout';
import AdminOverviewScreen from './AdminOverviewScreen';
import AdminDashboardScreen from './AdminDashboardScreen';
import AdminProjectsScreen from './AdminProjectsScreen';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatCvScreen />} />
        <Route path="/admin" element={<AdminLoginScreen />} />
        <Route element={<AdminLayout />}>
          <Route path="/admin/overview" element={<AdminOverviewScreen />} />
          <Route path="/admin/dashboard" element={<AdminDashboardScreen />} />
          <Route path="/admin/projects" element={<AdminProjectsScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
