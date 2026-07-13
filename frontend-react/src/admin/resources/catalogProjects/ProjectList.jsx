import { List } from 'react-admin';
import ProjectTree from './ProjectTree';

export default function ProjectList() {
  return (
    <List perPage={1000} pagination={false} actions={false}>
      <ProjectTree />
    </List>
  );
}
