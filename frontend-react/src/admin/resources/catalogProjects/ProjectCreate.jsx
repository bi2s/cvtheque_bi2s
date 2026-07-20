import { Create } from 'react-admin';
import { Box } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import ProjectForm from './ProjectForm';
import ProjectFormDrawer from './ProjectFormDrawer';

export default function ProjectCreate() {
  const [searchParams] = useSearchParams();
  const parentId = searchParams.get('parentId');

  return (
    <ProjectFormDrawer title="Nouveau projet">
      <Create redirect="list" component={Box} sx={{ boxShadow: 'none' }}>
        <ProjectForm defaultValues={{ parentId: parentId ? Number(parentId) : null }} />
      </Create>
    </ProjectFormDrawer>
  );
}
