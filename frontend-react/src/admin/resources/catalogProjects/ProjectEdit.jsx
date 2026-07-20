import { Edit } from 'react-admin';
import { Box } from '@mui/material';
import ProjectForm from './ProjectForm';
import ProjectFormDrawer from './ProjectFormDrawer';

export default function ProjectEdit() {
  return (
    <ProjectFormDrawer title="Modifier le projet">
      <Edit component={Box} actions={false} sx={{ boxShadow: 'none' }}>
        <ProjectForm />
      </Edit>
    </ProjectFormDrawer>
  );
}
