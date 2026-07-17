import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ChatCvScreen from './ChatCvScreen';
import AdminApp from './admin/AdminApp';
import ForgotPasswordPage from './ForgotPasswordPage';
import ResetPasswordPage from './ResetPasswordPage';

// <Admin basename="/admin"> must be nested inside a real BrowserRouter, per
// react-admin's own documented usage (ra-core's CoreAdminContext.tsx docs
// the exact <BrowserRouter><Admin basename="/admin">...</Admin></BrowserRouter>
// shape used here). When <Admin> is NOT already inside an existing router
// context, its RouterWrapper (ra-core's reactRouterProvider.tsx) creates its
// OWN internal router via createHashRouter - a hash-based router expecting
// URLs like /admin/#/consultants. This app's real URLs are plain paths with
// no hash, so a self-created router never matches anything: no error, just
// a permanently empty #root. An earlier attempt at fixing a routing bug
// un-nested <Admin> to avoid this exact self-created-router path, on a
// mistaken reading of RouterWrapper - that produced the blank-admin-page
// regression, not a fix. The correct shape is this one: one shared
// <BrowserRouter> at the top, <Admin basename="/admin"> nested inside it.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatCvScreen />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/admin/*" element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  );
}
