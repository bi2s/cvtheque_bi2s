import { Create } from 'react-admin';
import { useSearchParams } from 'react-router-dom';
import ProjectForm from './ProjectForm';

export default function ProjectCreate() {
  const [searchParams] = useSearchParams();
  const parentId = searchParams.get('parentId');

  return (
    <Create redirect="list">
      <ProjectForm defaultValues={{ parentId: parentId ? Number(parentId) : null }} />
    </Create>
  );
}
