import { DesignSystemShowcase } from './design-system/DesignSystemShowcase';
import { WorkspaceShell } from './features/shell/WorkspaceShell';

function App() {
  return new URLSearchParams(window.location.search).has('showcase')
    ? <DesignSystemShowcase />
    : <WorkspaceShell />;
}

export default App;
