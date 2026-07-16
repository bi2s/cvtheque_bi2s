import { usePermissions } from 'react-admin';
import { Navigate } from 'react-router-dom';
import Dashboard from './Dashboard';
import MyConsultantProfile from './resources/practiceManagers/MyConsultantProfile';
import HrDashboard from './resources/hrDashboard/HrDashboard';
import StaffingPlanning from './resources/practiceManagers/StaffingPlanning';

// A 'manager'-role admin lands directly on their own consultant profile
// instead of the full admin overview - 'admin' sees the same Dashboard as
// today. 'rh' lands on the HR dashboard instead: the main Dashboard calls
// /api/admin/dashboard-stats and /api/admin/activity, both now admin-only
// (RH scope reduction), so rendering it for RH would just be a page full
// of 401s - HrDashboard only calls the RH-accessible hr-dashboard-stats.
// 'pmo' redirects to the project catalogue (a real resource route, not a
// standalone dashboard component like the two above) - its List component
// depends on resource/route context from <Resource list={ProjectList}>, so
// it can't just be rendered here directly the way HrDashboard/
// MyConsultantProfile (plain fetch()-based pages) can. 'responsable_mission'/
// 'chef_projet' land directly on Planning (also a plain fetch()-based page,
// same as MyConsultantProfile/HrDashboard) - it's their only resource.
export default function RoleAwareDashboard() {
  const { permissions } = usePermissions();
  if (permissions?.role === 'manager') return <MyConsultantProfile />;
  if (permissions?.role === 'rh') return <HrDashboard />;
  if (permissions?.role === 'pmo') return <Navigate to="/admin/catalogProjects" replace />;
  if (['responsable_mission', 'chef_projet'].includes(permissions?.role)) return <StaffingPlanning />;
  return <Dashboard />;
}
