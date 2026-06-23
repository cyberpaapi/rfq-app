import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import RfqList from './pages/RfqList'
import RfqDetail from './pages/RfqDetail'
import CreateRfq from './pages/CreateRfq'
import SuppliersManage from './pages/SuppliersManage'
import ItemsPage from './pages/Items'
import Import from './pages/Import'
import Assign from './pages/Assign'
import Portal from './pages/Portal'
import Compare from './pages/Compare'
import Award from './pages/Award'
import Reports from './pages/Reports'
import Audit from './pages/Audit'
import Users from './pages/Users'

export default function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/rfqs" element={<RfqList />} />
          <Route path="/rfqs/new" element={<CreateRfq />} />
          <Route path="/rfqs/:id" element={<RfqDetail />} />
          <Route path="/suppliers" element={<SuppliersManage />} />
          <Route path="/items" element={<ItemsPage />} />
          <Route path="/import" element={<Import />} />
          <Route path="/assign" element={<Assign />} />
          <Route path="/assign/:id" element={<Assign />} />
          <Route path="/portal" element={<Portal />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/award" element={<Award />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/users" element={<Users />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </AuthProvider>
  )
}
