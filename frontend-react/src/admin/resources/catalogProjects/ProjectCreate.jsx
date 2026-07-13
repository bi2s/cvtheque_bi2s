import { Create } from 'react-admin';
import ProjectForm from './ProjectForm';

export default function ProjectCreate() {
  return (
    <Create redirect="list">
      <ProjectForm />
    </Create>
  );
}
