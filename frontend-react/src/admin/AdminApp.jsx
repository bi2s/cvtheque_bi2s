import { Admin, Resource } from 'react-admin';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutlineOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutlineOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import authProvider from './authProvider';
import dataProvider from './dataProvider';
import i18nProvider from './i18nProvider';
import Login from './Login';
import Dashboard from './Dashboard';
import ConsultantList from './resources/consultants/ConsultantList';
import ConsultantShow from './resources/consultants/ConsultantShow';
import ConsultantEdit from './resources/consultants/ConsultantEdit';
import ConsultantCreate from './resources/consultants/ConsultantCreate';
import ProjectList from './resources/catalogProjects/ProjectList';
import ProjectEdit from './resources/catalogProjects/ProjectEdit';
import ProjectCreate from './resources/catalogProjects/ProjectCreate';
import ChangeRequestList from './resources/changeRequests/ChangeRequestList';
import ChangeRequestShow from './resources/changeRequests/ChangeRequestShow';
import theme from '../theme';

export default function AdminApp() {
  return (
    <Admin
      basename="/admin"
      title="CVthèque"
      requireAuth
      authProvider={authProvider}
      dataProvider={dataProvider}
      i18nProvider={i18nProvider}
      loginPage={Login}
      dashboard={Dashboard}
      theme={theme}
    >
      <Resource
        name="consultants"
        list={ConsultantList}
        show={ConsultantShow}
        edit={ConsultantEdit}
        create={ConsultantCreate}
        icon={PeopleOutlineIcon}
        options={{ label: 'Consultants' }}
      />
      <Resource
        name="catalogProjects"
        list={ProjectList}
        edit={ProjectEdit}
        create={ProjectCreate}
        icon={WorkOutlineIcon}
        options={{ label: 'Catalogue Projets' }}
      />
      <Resource
        name="changeRequests"
        list={ChangeRequestList}
        show={ChangeRequestShow}
        icon={PendingActionsOutlinedIcon}
        options={{ label: 'Validations' }}
      />
    </Admin>
  );
}
