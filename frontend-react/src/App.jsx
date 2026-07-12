import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ChatCvScreen from './ChatCvScreen';
import AdminLoginScreen from './AdminLoginScreen';
import AdminDashboardScreen from './AdminDashboardScreen';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatCvScreen />} />
        <Route path="/admin" element={<AdminLoginScreen />} />
        <Route path="/admin/dashboard" element={<AdminDashboardScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
