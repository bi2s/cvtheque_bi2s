import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ChatCvScreen from './ChatCvScreen';
import AdminApp from './admin/AdminApp';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatCvScreen />} />
        <Route path="/admin/*" element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  );
}
