import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Card } from './components/ui'
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
import RfqRespond from './pages/RfqRespond'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* RFQ response link inside the protected workspace — no app chrome */}
        <Route path="/r/:id" element={<Guard permission="quote.submit"><RfqRespond /></Guard>} />
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </AuthProvider>
  )
}

function Guard({ permission, children }) {
  const { can, current } = useAuth()
  const allowed = Array.isArray(permission) ? permission.some(can) : can(permission)
  return allowed ? children : <Card className="m-5 p-8"><h1 className="text-xl font-bold">Access denied</h1><p className="mt-2 text-sm text-ink-500">{current.label} does not have access to this page. An administrator can update the role permissions.</p></Card>
}

function Home() {
  const { can, current } = useAuth()
  if (can('reports.view')) return <Dashboard />
  if (can('portal.access') || can('supplier.response.edit')) return <Navigate to="/supplier" replace />
  return <Card className="p-8"><h1 className="text-2xl font-bold">{current.label}</h1><p className="mt-2 text-sm text-ink-500">Choose an available page from the sidebar. Ask Administrator for any additional access.</p></Card>
}

function AppShell() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
          <Route path="/rfqs" element={<Guard permission="workspace.view"><RfqList /></Guard>} />
          <Route path="/rfqs/new" element={<Guard permission="rfq.create"><CreateRfq /></Guard>} />
          <Route path="/rfqs/:id" element={<Guard permission="workspace.view"><RfqDetail /></Guard>} />
          <Route path="/suppliers" element={<Guard permission={['supplier.manage', 'supplier.create']}><SuppliersManage /></Guard>} />
          <Route path="/items" element={<Guard permission="rfq.create"><ItemsPage /></Guard>} />
          <Route path="/import" element={<Guard permission="ai.use"><Guard permission="rfq.create"><Import /></Guard></Guard>} />
          <Route path="/assign" element={<Guard permission="rfq.create"><Assign /></Guard>} />
          <Route path="/assign/:id" element={<Guard permission="rfq.create"><Assign /></Guard>} />
          <Route path="/portal" element={<Guard permission={['portal.access', 'supplier.response.edit']}><Portal /></Guard>} />
          <Route path="/supplier" element={<Guard permission={['portal.access', 'supplier.response.edit']}><Portal /></Guard>} />
          <Route path="/compare" element={<Guard permission="rfq.evaluate"><Compare /></Guard>} />
          <Route path="/award" element={<Guard permission={['rfq.evaluate', 'award.decide', 'approve.hod', 'approve.finance']}><Award /></Guard>} />
          <Route path="/reports" element={<Guard permission="reports.view"><Reports /></Guard>} />
          <Route path="/audit" element={<Guard permission="audit.view"><Audit /></Guard>} />
          <Route path="/users" element={<Guard permission="users.manage"><Users /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
