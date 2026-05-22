import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '@/components/AppShell';
import Login from '@/pages/Login';
import PersonList from '@/pages/PersonList';
import PersonForm from '@/pages/PersonForm';
import RelationGraphPage from '@/pages/RelationGraph';
import MapView from '@/pages/MapView';
import SettingsPage from '@/pages/Settings';
import ShareView from '@/pages/ShareView';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/s/:token" element={<ShareView />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<RelationGraphPage />} />
        <Route path="/persons" element={<PersonList />} />
        <Route path="/persons/new" element={<PersonForm />} />
        <Route path="/persons/:id/edit" element={<PersonForm />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* /trash 已并入 /settings 的"回收站" tab；保留兼容跳转 */}
        <Route path="/trash" element={<Navigate to="/settings" replace />} />
        {/* 旧路由兼容 */}
        <Route path="/graph" element={<Navigate to="/dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
